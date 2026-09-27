( function () {

    "use strict";

    function connect() {}

    function disconnect() {}

    function status() { return "offline"; }

    const ws = { connect, disconnect, status };

    if( typeof window !== "undefined" ) ( window.RL ||= {} ).ws = ws;
    if( typeof module !== "undefined" ) module.exports = { ws };

})();
