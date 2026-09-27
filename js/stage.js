( function () {

    "use strict";

    function init() {}

    function setAgents( obsFloat32N, dones ) {}

    function setHero( obs4 ) {}

    function setGhostTrails( enabled ) {}

    const stage = { init, setAgents, setHero, setGhostTrails };

    if( typeof window !== "undefined" ) ( window.RL ||= {} ).stage = stage;
    if( typeof module !== "undefined" ) module.exports = { stage };

})();
