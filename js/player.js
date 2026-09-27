( function () {

    "use strict";

    const AGENT_PRESETS = [ 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1000 ];
    const SPEED_PRESETS = [ 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, "MAX" ];

    function init() {}

    function setMode( mode ) {}

    function setAgents( n ) {}

    function setSpeed( presetIndex ) {}

    function play() {}

    function pause() {}

    function reset() {}

    function seek( frac ) {}

    function onBatch( cb ) {}

    const player = { init, setMode, setAgents, setSpeed, play, pause, reset, seek, onBatch };

    if( typeof window !== "undefined" ) {

        ( window.RL ||= {} ).player = player;

        window.AGENT_PRESETS ||= AGENT_PRESETS;
        window.SPEED_PRESETS ||= SPEED_PRESETS;
    }

    if( typeof module !== "undefined" ) module.exports = { player };

})();
