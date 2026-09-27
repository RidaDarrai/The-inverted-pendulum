( function () {

    "use strict";

    function init() {}

    function setPolicy( policyJson ) {}

    function update( obs4, frame ) {}

    const nnviz = { init, setPolicy, update };

    if( typeof window !== "undefined" ) ( window.RL ||= {} ).nnviz = nnviz;
    if( typeof module !== "undefined" ) module.exports = { nnviz };

})();
