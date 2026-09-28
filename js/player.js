( function () {

    "use strict";

    const AGENT_PRESETS = [ 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1000 ];
    const SPEED_PRESETS = [ 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, "MAX" ];

    let mode = "live";
    let speedIdx = 2;
    let agents = 1;
    let stochastic = false;
    let episodeId = 0;
    let playing = false;
    let raf = 0;
    let lastT = null;
    let source = null;
    let sourceMode = null;
    let policyJson = null;
    let episodesJson = null;
    let ready = false;
    let inited = false;
    let dataPromise = null;
    let callbacks = [];

    function clamp01( x ) {

        return x < 0 ? 0 : ( x > 1 ? 1 : x );

    }

    function clampInt( v, min, max ) {

        const n = Math.round( Number( v ) );

        if( !Number.isFinite( n ) ) return min;

        return n < min ? min : ( n > max ? max : n );

    }

    function hasRAF() {

        return typeof requestAnimationFrame === "function";

    }

    function cfg() {

        return { agents, stochastic, episodeId, speed: SPEED_PRESETS[ speedIdx ] };

    }

    function loadJson( url ) {

        if( typeof fetch !== "function" ) return Promise.resolve( null );

        return fetch( url )
            .then( r => r && r.ok ? r.json() : null )
            .catch( () => null );

    }

    function loadFirst( urls ) {

        return urls.reduce(
            ( prev, url ) => prev.then( v => v !== null ? v : loadJson( url ) ),
            Promise.resolve( null )
        );

    }

    function ensureSource() {

        if( !ready ) return null;
        if( mode === "live" && !policyJson ) return null;
        if( mode === "replay" && !episodesJson ) return null;

        if( !source || sourceMode !== mode ) {

            if( source ) source.stop();

            source = mode === "replay"
                ? window.RL.sources.ReplaySource( episodesJson )
                : window.RL.sources.LocalSource( policyJson, window.RL.cartpole );

            sourceMode = mode;
            source.start( cfg() );

        }

        return source;

    }

    function emit( batch ) {

        for( const cb of callbacks.slice() ) cb( batch );

    }

    function refresh() {

        const s = ensureSource();

        if( !s ) return;

        const b = s.tick( 0 );

        if( b ) emit( b );

    }

    function applyCfg() {

        if( source ) source.start( cfg() );
        if( !playing ) refresh();

    }

    function frame( ts ) {

        raf = 0;

        if( !playing ) return;

        let dt = 0;

        if( lastT !== null ) dt = Math.min( 0.25, Math.max( 0, ( ts - lastT ) / 1000 ) );

        lastT = ts;

        const s = ensureSource();

        if( s ) {

            const b = s.tick( dt );

            if( b ) emit( b );

        }

        if( playing ) raf = requestAnimationFrame( frame );

    }
    function init() {

        if( !inited ) {

            inited = true;

            dataPromise = Promise.all( [
                loadFirst( [ "data/policy.json", "../data/policy.json" ] ),
                loadFirst( [ "data/episodes.json", "../data/episodes.json" ] )
            ] ).then( res => {

                policyJson = res[ 0 ];
                episodesJson = res[ 1 ];
                ready = true;

                if( !playing ) refresh();

            } );

        }

        return dataPromise;

    }

    function setMode( next ) {

        if( next !== "replay" && next !== "live" ) return;
        if( next === mode ) return;

        mode = next;

        if( source ) {

            source.stop();
            source = null;
            sourceMode = null;

        }

        if( ready && !playing ) refresh();

    }

    function setAgents( n ) {

        const v = clampInt( n, 1, 100000 );

        if( v === agents ) return;

        agents = v;
        applyCfg();

    }

    function setSpeed( presetIndex ) {

        const v = clampInt( presetIndex, 0, SPEED_PRESETS.length - 1 );

        if( v === speedIdx ) return;

        speedIdx = v;
        applyCfg();

    }

    function setEpisode( id ) {

        const v = Number( id );

        if( !Number.isFinite( v ) || v === episodeId ) return;

        episodeId = v;
        applyCfg();

    }

    function setStochastic( on ) {

        const v = !!on;

        if( v === stochastic ) return;

        stochastic = v;
        applyCfg();

    }

    function play() {

        if( playing ) return;

        playing = true;
        lastT = null;

        if( hasRAF() && !raf ) raf = requestAnimationFrame( frame );

    }

    function pause() {

        playing = false;

        if( raf ) {

            cancelAnimationFrame( raf );
            raf = 0;

        }

    }

    function reset() {

        if( source ) {

            source.stop();
            source = null;
            sourceMode = null;

        }

        if( ready && !playing ) refresh();

    }

    function seek( frac ) {

        if( !ready ) return;

        const s = ensureSource();

        if( !s || typeof s.seek !== "function" ) return;

        s.seek( clamp01( frac ) );

        const b = s.tick( 0 );

        if( b ) emit( b );

    }

    function onBatch( cb ) {

        callbacks.push( cb );

        return function () {

            const i = callbacks.indexOf( cb );

            if( i >= 0 ) callbacks.splice( i, 1 );

        };

    }

    function info() {

        return source ? source.info() : { stepsPerSec: 0 };

    }

    const player = {
        init,
        setMode,
        setAgents,
        setSpeed,
        setEpisode,
        setStochastic,
        play,
        pause,
        reset,
        seek,
        onBatch,
        info
    };

    if( typeof window !== "undefined" ) {

        ( window.RL ||= {} ).player = player;

        window.AGENT_PRESETS ||= AGENT_PRESETS;
        window.SPEED_PRESETS ||= SPEED_PRESETS;

    }

    if( typeof module !== "undefined" ) module.exports = { player, SPEED_PRESETS, AGENT_PRESETS };

})();
