( function () {

    "use strict";

    function init() {}

    function start() {}

    const app = { init, start };

    if( typeof window !== "undefined" ) ( window.RL ||= {} ).app = app;
    if( typeof module !== "undefined" ) module.exports = { app };

})();
