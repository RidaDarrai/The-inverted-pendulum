( function () {

    "use strict";

    function fromJSON( policyJson ) {

        const W = policyJson && Array.isArray( policyJson.W ) ? policyJson.W : null;
        const b = policyJson && Array.isArray( policyJson.b ) ? policyJson.b : null;

        function forward( obs4, options ) {

            if( !W || !W.length ) {

                return { action: 0, probs: [ 1, 0 ], activations: [ [], [], [ 1, 0 ] ] };

            }

            const stochastic = !!( options && options.stochastic );
            const rng = options && typeof options.rng === "function" ? options.rng : null;

            const acts = [];
            let a = obs4;

            for( let l = 0; l < W.length; l++ ) {

                const m = W[ l ];
                const bias = b && b[ l ] ? b[ l ] : [];
                const out = new Array( m.length );

                for( let j = 0; j < m.length; j++ ) {

                    const row = m[ j ];
                    let s = Number( bias[ j ] ) || 0;

                    for( let i = 0; i < row.length; i++ ) s += row[ i ] * a[ i ];

                    out[ j ] = s;

                }

                if( l < W.length - 1 ) {

                    for( let j = 0; j < out.length; j++ ) out[ j ] = Math.tanh( out[ j ] );

                } else {

                    let max = -Infinity;

                    for( let j = 0; j < out.length; j++ ) if( out[ j ] > max ) max = out[ j ];

                    let sum = 0;

                    for( let j = 0; j < out.length; j++ ) {

                        out[ j ] = Math.exp( out[ j ] - max );
                        sum += out[ j ];

                    }

                    for( let j = 0; j < out.length; j++ ) out[ j ] /= sum;

                }

                acts.push( out );
                a = out;

            }

            const probs = acts[ acts.length - 1 ];

            let action = 0;

            for( let j = 1; j < probs.length; j++ ) if( probs[ j ] > probs[ action ] ) action = j;

            if( stochastic && rng ) {

                const roll = rng();
                let acc = 0;

                action = probs.length - 1;

                for( let j = 0; j < probs.length; j++ ) {

                    acc += probs[ j ];

                    if( roll < acc ) {

                        action = j;
                        break;

                    }

                }

            }

            return { action, probs, activations: acts };

        }

        return { forward };

    }

    const policy = { fromJSON };

    if( typeof window !== "undefined" ) ( window.RL ||= {} ).policy = policy;
    if( typeof module !== "undefined" ) module.exports = { policy };

})();
