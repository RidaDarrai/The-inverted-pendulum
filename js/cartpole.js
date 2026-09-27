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

    function reset( seed ) {

        return new Float64Array( 4 );
    }

    function step( state, action ) {

        return { state, reward: 1, terminated: false, truncated: false };
    }

    const cartpole = { CONST, reset, step };

    if( typeof window !== "undefined" ) ( window.RL ||= {} ).cartpole = cartpole;
    if( typeof module !== "undefined" ) module.exports = { cartpole };

})();
