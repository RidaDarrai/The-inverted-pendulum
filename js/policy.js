( function () {

    "use strict";

    function forward( obs4, options ) {

        return {
            action: 0,
            probs: [ 1, 0 ],
            activations: [ new Array( 32 ).fill( 0 ), new Array( 32 ).fill( 0 ), [ 0, 0 ] ]
        };
    }

    function fromJSON( policyJson ) {

        return { forward };
    }

    const policy = { fromJSON };

    if( typeof window !== "undefined" ) ( window.RL ||= {} ).policy = policy;
    if( typeof module !== "undefined" ) module.exports = { policy };

})();
