( function () {

    "use strict";

    const CONST = {
        gravity: 9.8,
        masscart: 1.0,
        masspole: 0.1,
        length: 0.5,
        force_mag: 10.0,
        tau: 0.02,
        theta_threshold: 0.20943951,
        x_threshold: 2.4,
        total_mass: 1.1,
        polemass_length: 0.05,
        max_episode_steps: 500
    };

    const LCG_A = 1664525;
    const LCG_C = 1013904223;
    const LCG_M = 4294967296;

    let rngState = 12345 >>> 0;
    let episodeSteps = 0;

    function random() {

        rngState = ( Math.imul( rngState, LCG_A ) + LCG_C ) >>> 0;

        return rngState / LCG_M;

    }

    function reset( seed ) {

        if( seed !== undefined && seed !== null ) {

            if( typeof seed !== "number" || !Number.isFinite( seed ) ) {

                throw new TypeError( "cartpole.reset: seed must be a finite number" );

            }

            rngState = Math.floor( seed ) >>> 0;

        }

        episodeSteps = 0;

        const state = new Float64Array( 4 );

        for ( let i = 0; i < 4; i++ ) state[ i ] = random() * 0.1 - 0.05;

        return state;

    }

    function step( state, action, prevSteps ) {

        if( !state || state.length !== 4 ) {

            throw new TypeError( "cartpole.step: state must expose 4 values" );

        }

        const act = Number( action );

        if( act !== 0 && act !== 1 ) {

            throw new RangeError( "cartpole.step: action must be 0 or 1" );

        }

        if( prevSteps !== undefined && ( typeof prevSteps !== "number" || !Number.isFinite( prevSteps ) || prevSteps < 0 ) ) {

            throw new TypeError( "cartpole.step: prevSteps must be a non-negative number" );

        }

        const x = state[ 0 ];
        const x_dot = state[ 1 ];
        const th = state[ 2 ];
        const th_dot = state[ 3 ];

        const force = act === 1 ? CONST.force_mag : -CONST.force_mag;
        const costheta = Math.cos( th );
        const sintheta = Math.sin( th );

        const temp = ( force + CONST.polemass_length * th_dot * th_dot * sintheta ) / CONST.total_mass;

        const thacc = ( CONST.gravity * sintheta - costheta * temp )
            / ( CONST.length * ( 4 / 3 - CONST.masspole * costheta * costheta / CONST.total_mass ) );

        const xacc = temp - CONST.polemass_length * thacc * costheta / CONST.total_mass;

        const next = new Float64Array( 4 );

        next[ 0 ] = x + CONST.tau * x_dot;
        next[ 1 ] = x_dot + CONST.tau * xacc;
        next[ 2 ] = th + CONST.tau * th_dot;
        next[ 3 ] = th_dot + CONST.tau * thacc;

        const steps = ( prevSteps === undefined ? episodeSteps : prevSteps ) + 1;

        if( prevSteps === undefined ) episodeSteps = steps;

        const terminated = Math.abs( next[ 0 ] ) > CONST.x_threshold
            || Math.abs( next[ 2 ] ) > CONST.theta_threshold;

        const truncated = steps >= CONST.max_episode_steps;

        return { state: next, reward: 1, terminated, truncated };

    }

    const cartpole = { CONST, reset, step };

    if( typeof window !== "undefined" ) ( window.RL ||= {} ).cartpole = cartpole;
    if( typeof module !== "undefined" ) module.exports = { cartpole };

})();
