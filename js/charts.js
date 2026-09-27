( function () {

    "use strict";

    function initScore() {}

    function initTelemetry() {}

    function pushScore( point ) {}

    function pushTelemetry( point ) {}

    function reset() {}

    const charts = { initScore, initTelemetry, pushScore, pushTelemetry, reset };

    if( typeof window !== "undefined" ) ( window.RL ||= {} ).charts = charts;
    if( typeof module !== "undefined" ) module.exports = { charts };

})();
