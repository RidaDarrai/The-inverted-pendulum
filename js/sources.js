( function () {

    "use strict";

    const BASE_RATE = 50;
    const MAX_BUDGET_MS = 8;
    const FADE_WALL = 0.2;
    const SCORE_WINDOW = 100;
    const HORIZON = 500;
    const TAU = 0.02;

    function now() {

        return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

    }

    function clamp01( x ) {

        return x < 0 ? 0 : ( x > 1 ? 1 : x );

    }

    function makeMeter() {

        let lastT = 0;
        let lastSteps = 0;
        let rate = 0;

        return function ( steps ) {

            const t = now();

            if( !lastT ) {

                lastT = t;
                lastSteps = steps;

                return rate;

            }

            const elapsed = ( t - lastT ) / 1000;

            if( elapsed >= 0.25 ) {

                rate = ( steps - lastSteps ) / elapsed;
                lastT = t;
                lastSteps = steps;

            }

            return rate;

        };

    }

    function mulberry32( a ) {

        return function () {

            a |= 0;
            a = a + 0x6D2B79F5 | 0;

            let t = Math.imul( a ^ a >>> 15, 1 | a );

            t = t + Math.imul( t ^ t >>> 7, 61 | t ) ^ t;

            return ( ( t ^ t >>> 14 ) >>> 0 ) / 4294967296;

        };

    }

    function internalModel( policyJson ) {

        const W = policyJson && policyJson.W ? policyJson.W : null;
        const b = policyJson && policyJson.b ? policyJson.b : null;

        function forward( obs, opts ) {

            if( !W ) {

                return { action: 0, probs: [ 1, 0 ], activations: [ [], [], [ 1, 0 ] ] };

            }

            const acts = [];
            let a = obs;

            for( let l = 0; l < W.length; l++ ) {

                const m = W[ l ];
                const bias = b[ l ];
                const out = new Array( m.length );

                for( let j = 0; j < m.length; j++ ) {

                    const row = m[ j ];
                    let s = bias[ j ];

                    for( let i = 0; i < row.length; i++ ) s += row[ i ] * a[ i ];

                    out[ j ] = s;

                }

                if( l < W.length - 1 ) {

                    for( let j = 0; j < out.length; j++ ) out[ j ] = Math.tanh( out[ j ] );

                } else {

                    const max = Math.max( out[ 0 ], out[ 1 ] );
                    const e0 = Math.exp( out[ 0 ] - max );
                    const e1 = Math.exp( out[ 1 ] - max );
                    const sum = e0 + e1;

                    out[ 0 ] = e0 / sum;
                    out[ 1 ] = e1 / sum;

                }

                acts.push( out );
                a = out;

            }

            const probs = acts[ acts.length - 1 ];
            let action = probs[ 0 ] >= probs[ 1 ] ? 0 : 1;

            if( opts && opts.stochastic && opts.rng ) action = opts.rng() < probs[ 0 ] ? 0 : 1;

            return { action, probs, activations: acts };

        }

        return { forward };

    }

    function LocalSource( policyJson, cartpole ) {

        const cp = cartpole || ( typeof window !== "undefined" && window.RL && window.RL.cartpole ) || null;
        let model = null;

        if( typeof window !== "undefined" && window.RL && window.RL.policy && window.RL.policy.fromJSON ) {

            model = window.RL.policy.fromJSON( policyJson );

        } else {

            model = internalModel( policyJson );

        }

        const rng = mulberry32( 0xBEEF );
        const meter = makeMeter();

        let cfg = { agents: 1, stochastic: false, episodeId: 0, speed: 1 };
        let started = false;
        let n = 0;
        let states = null;
        let obs = null;
        let actions = null;
        let dones = null;
        let steps = null;
        let returns = null;
        let fade = null;
        let hero = null;
        let completed = [];
        let bestReturn = 0;
        let episodesDone = 0;
        let envSteps = 0;
        let globalStep = 0;
        let acc = 0;

        function initState( i ) {

            const s = cp.reset();

            states.set( s, i * 4 );
            steps[ i ] = 0;
            returns[ i ] = 0;
            dones[ i ] = 0;
            fade[ i ] = 0;

        }

        function rebuild() {

            n = Math.max( 1, Math.round( Number( cfg.agents ) || 1 ) );
            states = new Float64Array( n * 4 );
            obs = new Float32Array( n * 4 );
            actions = new Uint8Array( n );
            dones = new Uint8Array( n );
            steps = new Uint32Array( n );
            returns = new Float64Array( n );
            fade = new Float32Array( n );
            completed = [];
            bestReturn = 0;
            episodesDone = 0;
            envSteps = 0;
            globalStep = 0;
            acc = 0;

            for( let i = 0; i < n; i++ ) initState( i );

            const r = model.forward( states.subarray( 0, 4 ), { stochastic: cfg.stochastic, rng } );

            actions[ 0 ] = r.action;
            hero = {
                obs: new Float32Array( states.subarray( 0, 4 ) ),
                action: r.action,
                probs: r.probs,
                activations: r.activations
            };

        }

        function recordCompleted( r ) {

            completed.push( r );

            if( completed.length > SCORE_WINDOW ) completed.shift();
            if( r > bestReturn ) bestReturn = r;

            episodesDone++;

        }

        function respawn( i ) {

            initState( i );

            const r = model.forward( states.subarray( i * 4, i * 4 + 4 ), { stochastic: cfg.stochastic, rng } );

            if( i === 0 ) {

                actions[ 0 ] = r.action;
                hero = {
                    obs: new Float32Array( states.subarray( 0, 4 ) ),
                    action: r.action,
                    probs: r.probs,
                    activations: r.activations
                };

            }

        }

        function runSteps( k ) {

            for( let s = 0; s < k; s++ ) {

                for( let i = 0; i < n; i++ ) {

                    if( fade[ i ] > 0 ) continue;

                    const i4 = i * 4;
                    const view = states.subarray( i4, i4 + 4 );
                    const r = model.forward( view, { stochastic: cfg.stochastic, rng } );

                    actions[ i ] = r.action;

                    if( i === 0 ) {

                        hero = {
                            obs: new Float32Array( view ),
                            action: r.action,
                            probs: r.probs,
                            activations: r.activations
                        };

                    }

                    const res = cp.step( view, r.action, steps[ i ] );

                    steps[ i ]++;

                    if( res.state && res.state !== view ) states.set( res.state, i4 );

                    returns[ i ] += res.reward;

                    if( res.terminated || res.truncated ) {

                        recordCompleted( returns[ i ] );
                        dones[ i ] = 1;
                        fade[ i ] = FADE_WALL;

                    }

                }

                envSteps++;
                globalStep += n;

            }

        }

        function start( c ) {

            if( !cp ) {

                started = false;

                return;

            }

            const prev = cfg.agents;

            cfg = Object.assign( {}, cfg, c || {} );

            if( !started || !states || cfg.agents !== prev ) {

                rebuild();
                started = true;

            }

        }

        function tick( dt ) {

            if( !started || !cp ) return null;

            if( !( dt > 0 ) ) dt = 0;

            for( let i = 0; i < n; i++ ) {

                if( fade[ i ] > 0 ) {

                    fade[ i ] -= dt;

                    if( fade[ i ] <= 0 ) respawn( i );

                }

            }

            if( cfg.speed === "MAX" ) {

                const t0 = now();

                while( now() - t0 < MAX_BUDGET_MS ) runSteps( 1 );

            } else {

                const mult = Number( cfg.speed );

                acc += dt * BASE_RATE * ( Number.isFinite( mult ) && mult > 0 ? mult : 1 );

                let k = Math.floor( acc );

                if( k > 10000 ) k = 10000;

                acc -= k;

                if( k > 0 ) runSteps( k );

            }

            obs.set( states );

            let alive = 0;
            let progSum = 0;

            for( let i = 0; i < n; i++ ) {

                if( fade[ i ] <= 0 ) {

                    alive++;
                    progSum += Math.min( 1, steps[ i ] / HORIZON );

                }

            }

            let meanReturn = 0;

            if( completed.length ) {

                let sum = 0;

                for( let i = 0; i < completed.length; i++ ) sum += completed[ i ];

                meanReturn = sum / completed.length;

            }

            return {
                n,
                obs,
                actions,
                dones,
                heroIndex: 0,
                hero,
                globalStep,
                simTime: envSteps * TAU,
                episodeProgress: alive ? progSum / alive : 0,
                population: { alive, meanReturn, bestReturn }
            };

        }

        function info() {

            return {
                stepsPerSec: meter( globalStep ),
                agents: n,
                episodes: episodesDone
            };

        }

        function stop() {

            started = false;

        }

        return { start, tick, info, stop };

    }

    function ReplaySource( episodesJson ) {

        const meter = makeMeter();
        const episodes = episodesJson && episodesJson.episodes ? episodesJson.episodes : [];

        let cfg = { agents: 1, stochastic: false, episodeId: 0, speed: 1 };
        let ep = null;
        let idx = 0;
        let loops = 0;
        let started = false;
        let acc = 0;
        let globalStep = 0;

        function selectEpisode( id ) {

            ep = episodes.find( e => e.id === id ) || episodes[ 0 ] || null;
            idx = 0;
            loops = 0;
            globalStep = 0;

        }

        function start( c ) {

            const prevId = cfg.episodeId;
            const fresh = !started;

            cfg = Object.assign( {}, cfg, c || {} );

            if( fresh || !ep || cfg.episodeId !== prevId ) selectEpisode( cfg.episodeId );
            if( fresh ) acc = 0;

            started = true;

        }

        function makeBatch() {

            const stepsArr = ep.steps;
            const len = stepsArr.length;

            if( !len ) return null;

            const step = stepsArr[ idx ];
            const done = step.terminated || step.truncated ? 1 : 0;

            return {
                n: 1,
                obs: new Float32Array( step.obs ),
                actions: new Uint8Array( [ step.action ] ),
                dones: new Uint8Array( [ done ] ),
                heroIndex: 0,
                hero: {
                    obs: step.obs,
                    action: step.action,
                    probs: step.probs,
                    activations: step.activations
                },
                globalStep,
                simTime: globalStep * TAU,
                episodeProgress: ( idx + 1 ) / len,
                population: {
                    alive: done ? 0 : 1,
                    meanReturn: ep.return,
                    bestReturn: ep.return
                }
            };

        }

        function advance( k ) {

            const len = ep.steps.length;

            if( !len ) return;

            idx += k;

            while( idx >= len ) {

                idx -= len;
                loops++;

            }

            globalStep = loops * len + idx;

        }

        function tick( dt ) {

            if( !started || !ep ) return null;

            const batch = makeBatch();

            if( !batch ) return null;

            if( !( dt > 0 ) ) dt = 0;

            if( cfg.speed === "MAX" ) {

                const t0 = now();

                while( now() - t0 < MAX_BUDGET_MS ) advance( 1024 );

            } else {

                const mult = Number( cfg.speed );

                acc += dt * BASE_RATE * ( Number.isFinite( mult ) && mult > 0 ? mult : 1 );

                let k = Math.floor( acc );

                if( k > 10000 ) k = 10000;

                acc -= k;

                if( k > 0 ) advance( k );

            }

            return batch;

        }

        function seek( frac ) {

            if( !ep || !ep.steps.length ) return;

            idx = Math.round( clamp01( frac ) * ( ep.steps.length - 1 ) );
            globalStep = loops * ep.steps.length + idx;

        }

        function info() {

            return {
                stepsPerSec: meter( globalStep ),
                episodeId: ep ? ep.id : null,
                position: idx,
                length: ep ? ep.steps.length : 0
            };

        }

        function stop() {

            started = false;
            ep = null;
            acc = 0;

        }

        return { start, tick, seek, info, stop };

    }

    const sources = { ReplaySource, LocalSource };

    if( typeof window !== "undefined" ) ( window.RL ||= {} ).sources = sources;
    if( typeof module !== "undefined" ) module.exports = { sources };

})();
