( function () {

    "use strict";

    function makeSource() {

        return {
            start( cfg ) {},
            tick( dtSec ) { return null; },
            info() { return {}; },
            stop() {}
        };
    }

    function ReplaySource( episodesJson ) {

        return makeSource();
    }

    function LocalSource( policyJson, cartpole ) {

        return makeSource();
    }

    const sources = { ReplaySource, LocalSource };

    if( typeof window !== "undefined" ) ( window.RL ||= {} ).sources = sources;
    if( typeof module !== "undefined" ) module.exports = { sources };

})();
