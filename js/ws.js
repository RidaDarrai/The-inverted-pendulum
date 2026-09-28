( function () {

    "use strict";

    const HEALTH_PATH = "/api/health";
    const HEALTH_TIMEOUT_MS = 1000;
    const RETRY_DELAY_MS = 2000;
    const STREAMED = { metrics: true, policy: true };

    let connection = null;
    let retryTimer = null;
    let running = false;

    function dispatch( type, payload ) {
        if( typeof window === "undefined" || typeof CustomEvent !== "function" ) return;
        if( !STREAMED[ type ] || !payload ) return;
        try {
            window.dispatchEvent( new CustomEvent( "rl:" + type, { detail: payload } ) );
        } catch ( error ) {}
    }

    function probe() {
        if( typeof fetch !== "function" ) return Promise.resolve( false );
        if( typeof AbortController !== "function" ) {
            return fetch( HEALTH_PATH ).then( function ( response ) {
                return !!( response && response.ok );
            }, function () {
                return false;
            } );
        }
        const controller = new AbortController();
        const timer = setTimeout( function () {
            controller.abort();
        }, HEALTH_TIMEOUT_MS );
        return fetch( HEALTH_PATH, { signal: controller.signal } ).then(
            function ( response ) {
                clearTimeout( timer );
                return !!( response && response.ok );
            },
            function () {
                clearTimeout( timer );
                return false;
            }
        );
    }

    function scheduleRetry() {
        if( !running || retryTimer !== null ) return;
        retryTimer = setTimeout( function () {
            retryTimer = null;
            start();
        }, RETRY_DELAY_MS );
    }

    function start() {
        if( !running ) return;
        probe().then( function ( ok ) {
            if( !running ) return;
            if( !ok ) {
                scheduleRetry();
                return;
            }
            openSocket();
        } );
    }

    function openSocket() {
        if( !running || typeof WebSocket !== "function" ) return;
        if( typeof location === "undefined" || !location.host ) {
            scheduleRetry();
            return;
        }
        const scheme = location.protocol === "https:" ? "wss://" : "ws://";
        let next;
        try {
            next = new WebSocket( scheme + location.host + "/ws" );
        } catch ( error ) {
            scheduleRetry();
            return;
        }
        connection = next;
        next.onopen = function () {
            if( connection !== next ) {
                next.close();
                return;
            }
            if( retryTimer !== null ) {
                clearTimeout( retryTimer );
                retryTimer = null;
            }
        };
        next.onmessage = function ( event ) {
            if( connection !== next ) return;
            let message;
            try {
                message = JSON.parse( event.data );
            } catch ( error ) {
                return;
            }
            if( !message || typeof message !== "object" ) return;
            dispatch( message.type, message.payload );
        };
        next.onclose = function () {
            if( connection !== next ) return;
            connection = null;
            scheduleRetry();
        };
    }

    function connect() {
        if( running ) return;
        if( typeof location === "undefined" ) return;
        if( location.protocol !== "http:" && location.protocol !== "https:" ) return;
        running = true;
        start();
    }

    function disconnect() {
        running = false;
        if( retryTimer !== null ) {
            clearTimeout( retryTimer );
            retryTimer = null;
        }
        const active = connection;
        connection = null;
        if( active ) {
            try {
                active.close();
            } catch ( error ) {}
        }
    }

    function status() {
        if( connection && connection.readyState === 1 ) return "online";
        return "offline";
    }

    const ws = { connect, disconnect, status };

    if( typeof window !== "undefined" ) ( window.RL ||= {} ).ws = ws;
    if( typeof module !== "undefined" ) module.exports = { ws };

})();
