import ValueMap from './utils/ValueMap';
import Transition from './Transition';
import { SystemEvent, TransitionEvent } from './Events';
import { isString, isFunction } from './utils/utils';

export default function StateMachine (target, config)
{
    this.target         = target;
    this.state          = '';
    this.states         = [];
    this.transitions    = new ValueMap();
    this.actions        = new ValueMap();
    this.handlers       = new ValueMap();
    if(config)
    {
        this.initialize(config);
        this.update('system', 'initialize');
    }
}

/**
 * StateMachine prototype
 *
 * The property examples below illustrate a 4-state machine, with states:
 *
 * - intro > settings > summary > end
 *
 * And actions:
 *
 * - back | next | restart | finish
 */
StateMachine.prototype =
{
    // ------------------------------------------------------------------------------------------------
    // properties

        /**
         * Available state names
         *
         * - [
         *     intro,
         *     settings,
         *     summary,
         *     final
         *   ]
         *
         * @var {string[]}
         */
        states      : null,

        /**
         * Available transitions for each action
         *
         * action.from => to
         *
         * - next: {
         *     intro: settings,
         *     settings: summary
         *   },
         * - back: {
         *     settings: intro
         *   },
         * - restart: {
         *     summary:intro
         *   },
         * - finish: {
         *     summary:final
         *   },
         *
         * Transitions can also be functions
         *
         * - next: {
         *     intro: function() { return '<random state>' } // jump to a random state
         *   }
         *
         * @var {ValueMap}
         */
        transitions : null,

        /**
         * Actions that are available to be called from each state
         *
         * state => [ action, action, ... ]
         *
         * - intro: [
         *     'next'
         *   ],
         * - settings: [
         *     'next',
         *     'back'
         *   ],
         * - summary: [
         *     'restart'
         *     'finish',
         *   ]
         *
         * Actions can also be expressed as wildcards
         *
         * - intro: [
         *     '*' // any action is allowed from intro
         *   ]
         *
         * @var {ValueMap}
         */
        actions     : null,

        /**
         * Handler functions that should be called on each action event / state change
         *
         * name.type => [ handler, handler, ... ]
         *
         * - next: {
         *   - start: [
         *       hideModal
         *     ],
         *   - end: [
         *       showModal
         *     ]
         *   },
         * - summary: {
         *   - enter: [
         *       resetForm
         *     ],
         *   - leave: [
         *       validateForm,
         *       postData,
         *     ]
         *   },
         *   ...
         *
         * @var {ValueMap}
         */
        handlers   : null,

        /**
         * The current state
         *
         * @var {string}
         */
        state       : '',

        /**
         * Any active Transition object that is driving the state change
         *
         * @var {Transition}
         */
        transition  : null,

        /**
         * The target context in which to call all handlers
         *
         * @var {*}
         */
        target      : null,

        /**
         * The original config object
         *
         * @var {Object}
         */
        config      : null,


    // ------------------------------------------------------------------------------------------------
    // private methods

        /**
         * Initialize the FSM with a config object
         *
         * @private
         * @param config
         */
        initialize:function (config)
        {
            // assign config
            this.config     = config;

            // pre-collate all states
            addStates(this, 'from', config.events);
            addStates(this, 'to', config.events);

            // initial state
            if( ! config.initial )
            {
                config.initial = this.states[0];
            }

            // add transitions
            config.events.map( event =>
            {
                // shorthand
                if(isString(event))
                {
                    let matches = event.match(/(\w+)\s*[\|:=]\s*(\w+)\s*([<>-])\s*(\w.*)/);
                    let [,name, from, op, to] = matches;
                    if(op === '-')
                    {
                        this.add(name, from, to);
                        this.add(name, to, from);
                        return;
                    }
                    if(op === '<')
                    {
                        [from, to] = [to, from];
                    }
                    this.add(name, from, to);
                }

                // keys
                else
                {
                    this.add(event.name, event.from, event.to);
                }
            });

            // add handlers
            for(let name in config.handlers)
            {
                if(config.handlers.hasOwnProperty(name))
                {
                    this.on(name, config.handlers[name]);
                }
            }

            // state
            if( ! config.defer )
            {
                this.state = config.initial;
            }

        },

        /**
         * Dispatch an event
         *
         * @param name
         * @param type
         */
        update: function (name, type)
        {
            let event = name === 'system'
                ? SystemEvent
                : TransitionEvent;
            this.dispatch(name + '.' + type, new event(type));
        },


    // ------------------------------------------------------------------------------------------------
    // api

        /**
         * Attempt to run an action, resulting in a transition to a state
         *
         * @param   {string}    action
         * @param   {*[]}       rest
         * @returns {boolean}
         */
        do: function (action, ...rest)
        {
            if(this.can(action))
            {
                this.config.debug && console.info('Doing action "%s"', action);
                this.transition = Transition.create(this, action, rest);
                this.update('transition', 'start');
                this.transition.exec();
                return true;
            }
            return false;
        },

        /**
         * Attempt to go to a state
         *
         * Finds if an appropriate transition exists, then calls the related action if it does
         *
         * @param   {string}    state
         * @returns {boolean}
         */
        go: function (state)
        {
            if(this.has(state))
            {
                var action = this.getActionForState(state);
                if(action)
                {
                    return this.do(action);
                }
                this.config.debug && console.info('No transition exists from "%s" to "%s"', this.state, state);
            }
            else
            {
                this.config.debug && console.warn('No such state "%s"', state);
            }
            return false;
        },

        /**
         * Query a transition to see if a named action is available
         *
         * @param   {string}    action
         * @returns {boolean}
         */
        can: function (action)
        {
            if( ! this.actions.has(action) )
            {
                this.config.debug && console.warn('No such action "%s"', action);
            }
            return !! this.transitions.has(this.state, action);
        },

        /**
         * Query a transition to see if a named action is unavailable
         *
         * @param   {string}    action
         * @returns {boolean}
         */
        cannot: function (action)
        {
            return ! this.can(action);
        },

        /**
         * Test if the current state is the same as the supplied one
         *
         * @param   {string}    state       A state name to compare against the current state
         * @returns {boolean}
         */
        is: function (state)
        {
            if(this.states.indexOf(state) === -1)
            {
                this.config.debug && console.warn('No such state "%s"', state);
            }
            return state === this.state;
        },

        /**
         * Test if a state exists
         *
         * @param   {string}    state
         * @return  {boolean}
         */
        has: function(state)
        {
            return this.states.indexOf(state) !== -1;
        },

        /**
         * Get the available "to" states for the current or supplied state
         *
         * @param   {string}    [state]     Optional name of a state to get states for. Defaults to the current state
         * @returns {string[]}              An array of string states
         */
        getStatesFor: function (state = null)
        {
            state       = state || this.state;
            let actions = this.getActionsFor(state, true);
            return Object.keys(actions).map( name => actions[name] );
        },

        /**
         * Get the available actions (or actions and states) for the current or supplied state
         *
         * @param   {string}    [state]     Optional name of a state to get actions for. Defaults to the current state
         * @param   {boolean}   [asMap]     Optional boolean to return a Object of action:state properties. Defaults to false
         * @returns {string[]|Object}       An array of string actions, or a hash of action:states
         */
        getActionsFor: function (state = null, asMap = false)
        {
            state       = state || this.state;
            let actions = this.transitions.get(state || this.state);
            if(asMap)
            {
                let states  = {};
                actions.map( action =>
                {
                    states[action] = this.actions.get(action + '.' + state);
                });
                return states;
            }
            else
            {
                return actions;
            }
        },

        getActionForState: function (state)
        {
            if(this.has(state))
            {
                let actions = this.getActionsFor(null, true);
                for(let action in actions)
                {
                    if(actions[action] === state)
                    {
                        return action;
                    }
                }
            }
            return null
        },


    // ------------------------------------------------------------------------------------------------
    // flags

        /**
         * Test if the FSM has started
         *
         * @returns {boolean}
         */
        isStarted: function ()
        {
            return this.state !== '';
        },

        /**
         * Test if the FSM is transitioning
         *
         * @returns {boolean}
         */
        isTransitioning: function ()
        {
            return !! this.transition;
        },

        /**
         * Test if the FSM is paused (whilst transitioning)
         *
         * @returns {boolean}
         */
        isPaused: function ()
        {
            return this.transition
                ? this.transition.paused
                : false;
        },

        /**
         * Test if the FSM is on the "final" state
         *
         * @returns {boolean}
         */
        isComplete: function ()
        {
            return this.state === this.config.final;
        },


    // ------------------------------------------------------------------------------------------------
    // transitions

        /**
         * Pause any current transition
         *
         * @returns {StateMachine}
         */
        pause: function ()
        {
            if(this.transition)
            {
                this.transition.pause();
                this.update('transition', 'pause');
            }
            return this;
        },

        /**
         * Resume any current transition
         *
         * @returns {StateMachine}
         */
        resume: function ()
        {
            if(this.transition)
            {
                this.update('transition', 'resume');
                this.transition.resume();
            }
            return this;
        },

        /**
         * Cancel any current transition
         *
         * @returns {StateMachine}
         */
        cancel: function ()
        {
            if(this.transition)
            {
                this.state = this.transition.from;
                this.transition.clear();
                delete this.transition;
                this.update('transition', 'cancel');
            }
            return this;
        },

        /**
         * End any current transition, skipping remaining handlers
         *
         * @returns {StateMachine}
         */
        end: function ()
        {
            if(this.transition)
            {
                this.state = this.transition.to;
                this.transition.clear();
                delete this.transition;
                this.update('transition', 'end');
                this.update('system', 'change');
                if(this.isComplete())
                {
                    this.update('system', 'complete');
                }
            }
            return this;
        },

        /**
         * Reset the FSM to the initial, or supplied, state
         *
         * @returns {StateMachine}
         */
        reset:function(initial)
        {
            this.state = initial || this.config.initial;
            if(this.transition)
            {
                this.transition.clear();
                delete this.transition;
            }
            this.update('system', 'reset');
            return this;
        },


    // ------------------------------------------------------------------------------------------------
    // actions

        /**
         * Add a transition event
         *
         * @param   {string}    action
         * @param   {string}    from
         * @param   {string}    to
         * @return  {StateMachine}
         */
        add: function (action, from, to)
        {
            this.actions.set(action + '.' + from, to);
            this.transitions.add(from, action);
            return this;
        },

        remove: function (action, from, to)
        {
            this.states.remove(action, from);
        },


    // ------------------------------------------------------------------------------------------------
    // handlers

        /**
         * Add an event handler
         *
         * Event handler id pattern
         *
         * - family.type:target1 target2 target3 ...
         *
         * Valid event id patterns:
         *
         * - system:(change|update|final|reset)
         * - action:(start|end)
         * - state:(leave|enter|add|remove)
         * - transition:(pause|resume|cancel)
         *
         * As event names are unique, they can be used without the prefix:
         *
         * - change
         * - pause
         * - start
         * - end
         * - leave:red
         * - enter:blue green
         * - start:next
         * - end:back
         *
         * You can also just pass action or names to target individual state.leave / action.end events:
         *
         * - next
         * - intro
         *
         * @param id
         * @param fn
         * @return {StateMachine}
         */
        on: function (id, fn)
        {
            // get initial matches
            let matches = id.match(/^(?:(\w+)\.)?(\w+[-.\w]*)(?::(.*))?/);
            if(!matches)
            {
                console.error('Warning adding event handler: invalid signature "%s"', id);
                return this;
            }
            let [,event, type, target] = matches;

            // determine event if not found
            if(!event)
            {
                // check if shorthand global was passed
                event = eventLookup[type];

                // if event is still null, attempt to determine type from existing states or actions
                if(!event)
                {
                    if(this.states.indexOf(type) !== -1)
                    {
                        target  = type;
                        event   = 'state';
                        type    = 'leave';

                    }
                    else if(this.actions.has(type))
                    {
                        target  = type;
                        event   = 'action';
                        type    = 'end';
                    }
                    else
                    {
                        this.config.debug && console.error('Warning adding event handler: unable to map signature "%s" to a valid event or existing entity', id);
                        return;
                    }
                }
            }

            // assign
            let targets = target
                ? target.match(/\w+/g)
                : ['*'];
            targets.map( target => addHandler(this, event, type, target, fn) );
            return this;
        },

        off: function (path, fn)
        {
            return this;
        },

        dispatch: function(path, event)
        {
            this.config.debug && console.info('StateMachine update "%s"', path);
            let handlers = this.handlers.get(path);
            if(handlers)
            {
                // do we need to pass additional arguments?
                handlers.map(fn => fn(event) );
            }

        }

};

// hash of family types
let eventLookup =
{
    change	:'system',
    update	:'system',
    complete:'system',
    reset	:'system',
    start	:'action',
    end	    :'action',
    leave	:'state',
    enter	:'state',
    add	    :'state',
    remove	:'state',
    pause	:'transition',
    resume	:'transition',
    cancel	:'transition'
};

/**
 * Parses config and adds unique state names to states array
 *
 * @param {StateMachine}    fsm
 * @param {string}          key
 * @param {Object[]}        transitions
 */
function addStates(fsm, key, transitions)
{
    transitions.map( event => addState(fsm, event[key]) );
}

function addState (fsm, state)
{
    if (isString(state) && fsm.states.indexOf(state) === -1)
    {
        fsm.states.push(state);
    }
}

/**
 * Generic function to parse action and add callback
 *
 * @param {StateMachine}    fsm
 * @param {string}          event
 * @param {string}          type
 * @param {string}          target
 * @param {Function}        fn
 */
function addHandler(fsm, event, type, target, fn)
{
    // warn for invalid actions / states
    if(target !== '*')
    {
        if(event === 'state' && fsm.states.indexOf(target) === -1)
        {
            fsm.config.debug && console.warn('Warning assigning state.%s handler: no such state "%s"', type, target);
        }
        else if(event === 'action' && ! fsm.actions.has(target))
        {
            fsm.config.debug && console.warn('Warning assigning action.%s handler: no such action "%s"', type, target);
        }
    }

    // check handler is a function
    if( ! isFunction(fn) )
    {
        throw new Error('Error assigning ' +event+ '.' +type+ ' handler; callback is not a Function', fn);
    }

    // assign
    let path = event === 'action' || event === 'state'
        ? [event, target, type].join('.')
        : event + '.' + type;
    fsm.handlers.insert(path, fn);
}

/*
// event libs
https://www.npmjs.com/package/event-box
https://www.npmjs.com/package/dispatchy
*/

