( function () {

    "use strict";

    const SPEED_PRESETS = [ 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, "MAX" ];
    const AGENT_PRESETS = [ 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1000 ];
    const BASE_STEPS_PER_SEC = 50;
    const MAX_EPISODE_STEPS = 500;
    const SCORE_INTERVAL_MS = 100;
    const SPEED_BADGE_INTERVAL_MS = 200;
    const MEASURE_WINDOW_MS = 500;
    const SCRUBBER_MAX = 1000;

    const state = {
        booted: false,
        mode: "replay",
        agents: 1,
        speedIndex: 2,
        stochastic: false,
        ghosts: false,
        playing: false,
        episodeId: 0,
        scrubbing: false,
        policy: null,
        metrics: null,
        episodes: null,
        appliedAgents: null,
        appliedSpeed: null,
        backendOffline: false,
        lastScoreAt: 0,
        lastSpeedBadgeAt: 0,
        lastGlobalStep: null,
        measureStartedAt: 0,
        pendingSteps: 0,
        measuredStepsPerSec: 0
    };

    function byId( id ) {
        return typeof document !== "undefined" ? document.getElementById( id ) : null;
    }

    function ns() {
        if ( typeof window !== "undefined" && window.RL ) return window.RL;
        return {};
    }

    function setText( id, text ) {
        const node = byId( id );
        if ( node ) node.textContent = text;
    }

    function call( target, method, a, b, c ) {
        if ( !target || typeof target[ method ] !== "function" ) return undefined;
        return target[ method ]( a, b, c );
    }

    function clampInt( value, min, max ) {
        const n = Math.round( Number( value ) );
        if ( !isFinite( n ) ) return min;
        return Math.min( max, Math.max( min, n ) );
    }

    function clampNumber( value, min, max ) {
        const n = Number( value );
        if ( !isFinite( n ) ) return min;
        return Math.min( max, Math.max( min, n ) );
    }

    function formatScore( value ) {
        const n = Number( value );
        if ( !isFinite( n ) ) return "0";
        return String( Math.round( n * 10 ) / 10 );
    }

    function loadJSON( path ) {
        if ( typeof fetch !== "function" ) return Promise.resolve( null );
        return fetch( path ).then( function ( response ) {
            if ( !response || !response.ok ) return null;
            return response.json();
        } ).catch( function () {
            return null;
        } );
    }

    function loadData() {
        return Promise.all( [
            loadJSON( "data/policy.json" ),
            loadJSON( "data/training_metrics.json" ),
            loadJSON( "data/episodes.json" )
        ] ).then( function ( rows ) {
            return { policy: rows[ 0 ], metrics: rows[ 1 ], episodes: rows[ 2 ] };
        } ).catch( function () {
            return { policy: null, metrics: null, episodes: null };
        } );
    }

    function currentEpisodes() {
        const list = state.episodes && state.episodes.episodes;
        return Array.isArray( list ) ? list : null;
    }

    function currentEpisode() {
        const list = currentEpisodes();
        if ( !list ) return null;
        for ( let i = 0; i < list.length; i++ ) {
            if ( list[ i ] && list[ i ].id === state.episodeId ) return list[ i ];
        }
        return list[ state.episodeId ] || null;
    }

    function episodeLength() {
        if ( state.mode === "live" ) return MAX_EPISODE_STEPS;
        const episode = currentEpisode();
        if ( !episode ) return MAX_EPISODE_STEPS;
        if ( episode.length ) return episode.length;
        if ( episode.steps && episode.steps.length ) return episode.steps.length;
        return MAX_EPISODE_STEPS;
    }

    function nowMs() {
        return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    }

    function measureSteps( batch ) {
        const step = Number( batch.globalStep );
        const now = nowMs();
        if ( !isFinite( step ) ) return;

        if ( state.lastGlobalStep === null ) {
            state.lastGlobalStep = step;
            state.measureStartedAt = now;
            return;
        }

        const delta = step - state.lastGlobalStep;
        state.lastGlobalStep = step;

        if ( delta < 0 ) {
            state.pendingSteps = 0;
            state.measureStartedAt = now;
            return;
        }

        state.pendingSteps += delta;
        const elapsed = now - state.measureStartedAt;
        if ( elapsed < MEASURE_WINDOW_MS ) return;
        if ( elapsed <= MEASURE_WINDOW_MS * 4 ) {
            state.measuredStepsPerSec = state.pendingSteps * 1000 / elapsed;
        }
        state.pendingSteps = 0;
        state.measureStartedAt = now;
    }

    function currentStepsPerSec() {
        const preset = SPEED_PRESETS[ state.speedIndex ];
        if ( preset !== "MAX" ) return BASE_STEPS_PER_SEC * preset;
        return state.measuredStepsPerSec;
    }

    function applyData( data ) {
        if ( !data ) return;
        if ( data.policy ) {
            state.policy = data.policy;
            call( ns().nnviz, "setPolicy", data.policy );
        }
        if ( data.metrics ) {
            state.metrics = data.metrics;
            updateTrainingBadges( data.metrics );
        }
        if ( data.episodes ) {
            state.episodes = data.episodes;
            fillEpisodeSelect( data.episodes );
        }
        setText( "step-readout", "0 / " + episodeLength() );
    }

    function fillEpisodeSelect( episodes ) {
        const select = byId( "episode-select" );
        const list = episodes && Array.isArray( episodes.episodes ) ? episodes.episodes : [];
        if ( !select || !list.length ) return;

        while ( select.firstChild ) select.removeChild( select.firstChild );

        list.forEach( function ( episode, index ) {
            const id = episode && isFinite( Number( episode.id ) ) ? Number( episode.id ) : index;
            const option = document.createElement( "option" );
            option.value = String( id );
            option.textContent = episode && episode.label
                ? "episode " + id + " \u00b7 " + episode.label
                : "episode " + id;
            select.appendChild( option );
        } );

        state.episodeId = Number( select.value ) || 0;
        select.value = String( state.episodeId );
    }

    function updateTrainingBadges( metrics ) {
        const generations = metrics && metrics.generations;
        if ( !generations || !generations.length ) return;
        const latest = generations[ generations.length - 1 ];
        setText( "training-gen", "gen " + latest.gen );
        setText( "training-best", "best " + formatScore( latest.best ) );
    }

    function updatePopulation( population ) {
        if ( !population ) return;
        setText( "pop-alive", String( Math.round( Number( population.alive ) || 0 ) ) );
        setText( "pop-mean", String( Math.round( Number( population.meanReturn ) || 0 ) ) );
    }

    function updateSpeedBadge( speed ) {
        if ( SPEED_PRESETS[ state.speedIndex ] !== "MAX" ) return;
        const now = Date.now();
        if ( now - state.lastSpeedBadgeAt < SPEED_BADGE_INTERVAL_MS ) return;
        state.lastSpeedBadgeAt = now;
        setText( "status-speed", Math.round( speed ) + "/s" );
    }

    function updateStepReadout( batch ) {
        const length = episodeLength();
        const progress = clampNumber( batch.episodeProgress, 0, 1 );
        setText( "step-readout", Math.round( progress * length ) + " / " + length );

        const scrubber = byId( "scrubber" );
        if ( scrubber && !state.scrubbing ) {
            const value = String( Math.round( progress * SCRUBBER_MAX ) );
            if ( scrubber.value !== value ) scrubber.value = value;
        }
    }

    function pushScore( batch ) {
        const now = Date.now();
        if ( now - state.lastScoreAt < SCORE_INTERVAL_MS ) return;
        state.lastScoreAt = now;

        const population = batch.population;
        if ( state.mode === "live" ) {
            if ( !population ) return;
            call( ns().charts, "pushScore", {
                x: batch.globalStep,
                best: Number( population.bestReturn ) || 0,
                mean: Number( population.meanReturn ) || 0
            } );
            return;
        }

        const cumulative = clampNumber( batch.episodeProgress, 0, 1 ) * episodeLength();
        call( ns().charts, "pushScore", {
            x: batch.globalStep,
            best: cumulative,
            mean: cumulative
        } );
    }

    function onBatch( batch ) {
        if ( !batch ) return;

        call( ns().stage, "setAgents", batch.obs, batch.dones );

        const hero = batch.hero;
        if ( hero && hero.obs ) {
            call( ns().stage, "setHero", hero.obs );
            call( ns().nnviz, "update", hero.obs, hero );
        }

        measureSteps( batch );
        const speed = currentStepsPerSec();
        call( ns().charts, "pushTelemetry", {
            t: Number( batch.simTime ) || 0,
            speed: speed,
            theta: hero && hero.obs ? hero.obs[ 2 ] : 0
        } );

        updatePopulation( batch.population );
        updateStepReadout( batch );
        updateSpeedBadge( speed );
        pushScore( batch );
    }

    function nearestAgentIndex( agents ) {
        let bestIndex = 0;
        let bestDistance = Infinity;
        AGENT_PRESETS.forEach( function ( preset, index ) {
            const distance = Math.abs( preset - agents );
            if ( distance < bestDistance ) {
                bestDistance = distance;
                bestIndex = index;
            }
        } );
        return bestIndex;
    }

    function applyAgents( value ) {
        const agents = clampInt( value, 1, 1000 );
        state.agents = agents;

        const input = byId( "agents-input" );
        if ( input && Number( input.value ) !== agents ) input.value = String( agents );

        const slider = byId( "agents-slider" );
        if ( slider ) {
            const index = nearestAgentIndex( agents );
            if ( Number( slider.value ) !== index ) slider.value = String( index );
        }

        if ( state.appliedAgents !== agents ) {
            state.appliedAgents = agents;
            call( ns().player, "setAgents", agents );
        }
    }

    function applySpeed( value ) {
        const index = clampInt( value, 0, SPEED_PRESETS.length - 1 );
        state.speedIndex = index;

        const slider = byId( "speed-slider" );
        if ( slider && Number( slider.value ) !== index ) slider.value = String( index );

        if ( state.appliedSpeed !== index ) {
            state.appliedSpeed = index;
            call( ns().player, "setSpeed", index );
        }

        const preset = SPEED_PRESETS[ index ];
        if ( preset === "MAX" ) {
            setText( "speed-label", "FULL SPEED" );
            state.lastSpeedBadgeAt = 0;
            setText( "status-speed", Math.round( currentStepsPerSec() ) + "/s" );
        } else {
            setText( "speed-label", preset + "\u00d7" );
            setText( "status-speed", preset + "\u00d7" );
        }
    }

    function applyMode( mode ) {
        if ( mode !== "replay" && mode !== "live" ) return;
        state.mode = mode;

        const holder = byId( "mode-toggle" );
        if ( holder ) {
            const buttons = holder.querySelectorAll( ".mode-btn" );
            Array.prototype.forEach.call( buttons, function ( button ) {
                button.classList.toggle( "active", button.getAttribute( "data-mode" ) === mode );
            } );
        }

        setText( "status-mode", mode );

        const replayOnly = mode === "replay";
        const select = byId( "episode-select" );
        if ( select ) select.disabled = !replayOnly;
        const scrubber = byId( "scrubber" );
        if ( scrubber ) scrubber.disabled = !replayOnly;

        call( ns().player, "setMode", mode );
        setText( "step-readout", "0 / " + episodeLength() );
    }

    function togglePlay() {
        if ( state.playing ) {
            call( ns().player, "pause" );
            state.playing = false;
            setText( "play-pause", "play" );
        } else {
            call( ns().player, "play" );
            state.playing = true;
            setText( "play-pause", "pause" );
        }
    }

    function resetPlayback() {
        call( ns().player, "reset" );
        const scrubber = byId( "scrubber" );
        if ( scrubber && state.mode === "replay" ) scrubber.value = "0";
        setText( "step-readout", "0 / " + episodeLength() );
    }

    function selectEpisode( value ) {
        const id = clampInt( value, 0, 1000000 );
        state.episodeId = id;

        const select = byId( "episode-select" );
        if ( select ) select.value = String( id );

        call( ns().player, "setEpisode", id );
        call( ns().player, "reset" );

        const scrubber = byId( "scrubber" );
        if ( scrubber ) scrubber.value = "0";
        setText( "step-readout", "0 / " + episodeLength() );
    }

    function scrub() {
        const scrubber = byId( "scrubber" );
        if ( !scrubber || state.mode !== "replay" ) return;
        const fraction = clampNumber( Number( scrubber.value ) / SCRUBBER_MAX, 0, 1 );
        call( ns().player, "seek", fraction );
        const length = episodeLength();
        setText( "step-readout", Math.round( fraction * length ) + " / " + length );
    }

    function wireModeToggle() {
        const holder = byId( "mode-toggle" );
        if ( !holder ) return;
        holder.addEventListener( "click", function ( event ) {
            const target = event.target;
            const button = target && target.closest ? target.closest( ".mode-btn" ) : null;
            if ( !button ) return;
            applyMode( button.getAttribute( "data-mode" ) );
        } );
        const active = holder.querySelector( ".mode-btn.active" );
        applyMode( active ? active.getAttribute( "data-mode" ) : "replay" );
    }

    function wireAgents() {
        const slider = byId( "agents-slider" );
        if ( slider ) {
            slider.addEventListener( "input", function () {
                applyAgents( AGENT_PRESETS[ clampInt( slider.value, 0, AGENT_PRESETS.length - 1 ) ] );
            } );
            slider.addEventListener( "change", function () {
                applyAgents( AGENT_PRESETS[ clampInt( slider.value, 0, AGENT_PRESETS.length - 1 ) ] );
            } );
        }

        const input = byId( "agents-input" );
        if ( input ) {
            const onValue = function () {
                const raw = input.value.trim();
                if ( raw === "" ) return;
                if ( !isFinite( Number( raw ) ) ) return;
                applyAgents( raw );
            };
            input.addEventListener( "input", onValue );
            input.addEventListener( "change", onValue );
        }

        applyAgents( input && input.value !== "" ? input.value : 1 );
    }

    function wireSpeed() {
        const slider = byId( "speed-slider" );
        if ( slider ) {
            const onValue = function () { applySpeed( slider.value ); };
            slider.addEventListener( "input", onValue );
            slider.addEventListener( "change", onValue );
        }
        applySpeed( slider ? slider.value : state.speedIndex );
    }

    function wireTransport() {
        const playPause = byId( "play-pause" );
        if ( playPause ) playPause.addEventListener( "click", togglePlay );

        const reset = byId( "rl-reset" );
        if ( reset ) reset.addEventListener( "click", resetPlayback );
    }

    function wireToggle( id, onApply ) {
        const button = byId( id );
        if ( !button ) return;
        let on = button.classList.contains( "active" );
        onApply( on );
        button.addEventListener( "click", function () {
            on = !on;
            button.classList.toggle( "active", on );
            onApply( on );
        } );
    }

    function wireToggles() {
        wireToggle( "stochastic-toggle", function ( on ) {
            state.stochastic = on;
            call( ns().player, "setStochastic", on );
        } );
        wireToggle( "ghosts-toggle", function ( on ) {
            state.ghosts = on;
            call( ns().stage, "setGhostTrails", on );
        } );
    }

    function wireEpisodeAndScrubber() {
        const select = byId( "episode-select" );
        if ( select ) {
            select.addEventListener( "change", function () {
                if ( select.value === "" ) return;
                selectEpisode( select.value );
            } );
            if ( select.value !== "" ) state.episodeId = clampInt( select.value, 0, 1000000 );
        }

        const scrubber = byId( "scrubber" );
        if ( scrubber ) {
            scrubber.addEventListener( "pointerdown", function () { state.scrubbing = true; } );
            scrubber.addEventListener( "input", scrub );
            scrubber.addEventListener( "change", scrub );
        }

        if ( typeof window !== "undefined" ) {
            window.addEventListener( "pointerup", function () { state.scrubbing = false; } );
            window.addEventListener( "pointercancel", function () { state.scrubbing = false; } );
        }
    }

    function subscribeToEvents() {
        if ( typeof window === "undefined" ) return;

        window.addEventListener( "rl:metrics", function ( event ) {
            const metrics = event && event.detail;
            if ( !metrics ) return;
            state.metrics = metrics;
            updateTrainingBadges( metrics );
        } );

        window.addEventListener( "rl:policy", function ( event ) {
            const policy = event && event.detail;
            if ( !policy ) return;
            state.policy = policy;
            call( ns().nnviz, "setPolicy", policy );
        } );
    }

    function init() {
        if ( state.booted ) return;
        state.booted = true;

        call( ns().stage, "init" );
        call( ns().nnviz, "init" );
        call( ns().charts, "initScore" );
        call( ns().charts, "initTelemetry" );

        call( ns().player, "init" );
        call( ns().player, "onBatch", onBatch );

        subscribeToEvents();

        wireModeToggle();
        wireAgents();
        wireSpeed();
        wireTransport();
        wireToggles();
        wireEpisodeAndScrubber();
    }

    function connectBackend() {
        const socket = ns().ws;
        if ( !socket || typeof socket.connect !== "function" ) return;
        try {
            socket.connect();
        } catch ( error ) {
            state.backendOffline = true;
        }
    }

    function start() {
        loadData().then( applyData );
        connectBackend();
    }

    function boot() {
        init();
        start();
    }

    const app = { init, start };

    if( typeof window !== "undefined" ) ( window.RL ||= {} ).app = app;
    if( typeof module !== "undefined" ) module.exports = { app };

    if( typeof window !== "undefined" && typeof document !== "undefined" ) {
        if( document.readyState === "loading" ) {
            document.addEventListener( "DOMContentLoaded", boot );
        } else {
            boot();
        }
    }

})();
