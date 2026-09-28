( function () {

    "use strict";

    const SVG_NS = "http://www.w3.org/2000/svg";
    const X_LIMIT = 2.4;
    const RAIL_HALF = 130;
    const UNIT = RAIL_HALF / X_LIMIT;
    const POLE_LEN = 65;
    const RAD2DEG = 180 / Math.PI;
    const FADE_OUT = 0.14;
    const FADE_IN = 0.22;
    const TRAIL_BUCKETS = 5;
    const ALPHA_BUCKETS = 6;
    const TRAIL_ALPHA = 0.45;
    const GHOST_ALPHA = 0.6;
    const TAU = Math.PI * 2;

    const TRAIL_COLORS = [];
    for ( let b = 0; b < TRAIL_BUCKETS; b++ ) {
        const a = TRAIL_ALPHA * Math.pow( ( b + 1 ) / TRAIL_BUCKETS, 1.7 );
        TRAIL_COLORS.push( "rgba(99,135,167," + a.toFixed( 3 ) + ")" );
    }

    const POLE_COLORS = [];
    const BOB_COLORS = [];
    for ( let b = 0; b < ALPHA_BUCKETS; b++ ) {
        const a = ( ( b + 1 ) / ALPHA_BUCKETS ) * GHOST_ALPHA;
        POLE_COLORS.push( "rgba(99,135,167," + a.toFixed( 3 ) + ")" );
        BOB_COLORS.push( "rgba(140,188,229," + Math.min( 1, a + 0.15 ).toFixed( 3 ) + ")" );
    }

    let inited = false;
    let hooksBound = false;
    let resizeObs = null;
    let stageSvg = null;
    let rulerEl = null;
    let canvas = null;
    let ctx = null;
    let drives = [];
    let heroTx = null;
    let heroDeg = null;
    let heroObs = null;
    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    let drawQueued = false;

    let nAgents = 0;
    let heroIdx = -1;
    let obsBuf = null;
    let donesBuf = null;
    let prevDone = null;
    let alphas = null;
    let gx = null;
    let gy = null;
    let gtx = null;
    let gty = null;
    let trailLen = 0;
    let trailPts = null;
    let trailHead = null;
    let trailCount = null;
    let trailsOn = true;

    function round3( v ) {
        const r = Math.round( v * 1000 ) / 1000;
        return r === 0 ? 0 : r;
    }

    function fmt( v ) {
        if( !isFinite( v ) ) v = 0;
        v = Math.round( v * 1000 ) / 1000;
        return v === 0 ? "0" : String( v );
    }

    function fmtMeters( v ) {
        const r = Math.round( v * 10 ) / 10;
        return r === 0 ? "0" : String( r );
    }

    function trailLenFor( count ) {
        if( count <= 32 ) return 64;
        if( count <= 256 ) return 16;
        return 6;
    }

    function setOrigin( el, ox, oy ) {
        el.style.transformBox = "view-box";
        el.style.transformOrigin = ox + "px " + oy + "px";
    }

    function applyAll( els, value ) {
        for( let i = 0; i < els.length; i++ ) {
            if( els[ i ].style.transform !== value ) els[ i ].style.transform = value;
        }
    }

    function addDrive( svg ) {
        if( !svg ) return;
        const rotate = Array.prototype.slice.call( svg.querySelectorAll( ".pole, .top-circle" ) );
        const slide = Array.prototype.slice.call( svg.querySelectorAll( ".slider" ) );
        if( !rotate.length && !slide.length ) return;
        let ox = 0;
        let oy = 0;
        const originEl = svg.querySelector( ".pole[transform-origin], .top-circle[transform-origin]" );
        if( originEl ) {
            const parts = ( originEl.getAttribute( "transform-origin" ) || "" ).split( /[\s,]+/ );
            if( parts.length >= 2 ) {
                const px = parseFloat( parts[ 0 ] );
                const py = parseFloat( parts[ 1 ] );
                if( isFinite( px ) ) ox = px;
                if( isFinite( py ) ) oy = py;
            }
        }
        for( let i = 0; i < rotate.length; i++ ) setOrigin( rotate[ i ], ox, oy );
        for( let i = 0; i < slide.length; i++ ) setOrigin( slide[ i ], ox, oy );
        drives.push( { rotate: rotate, slide: slide } );
    }

    function buildRuler() {
        if( !rulerEl ) return;
        while( rulerEl.firstChild ) rulerEl.removeChild( rulerEl.firstChild );
        const base = document.createElementNS( SVG_NS, "line" );
        base.setAttribute( "class", "ruler-base" );
        base.setAttribute( "x1", "-130" );
        base.setAttribute( "y1", "1" );
        base.setAttribute( "x2", "130" );
        base.setAttribute( "y2", "1" );
        rulerEl.appendChild( base );
        for( let i = 0; i <= 12; i++ ) {
            const x = round3( -130 + i * ( 260 / 12 ) );
            const major = i % 2 === 0;
            const tick = document.createElementNS( SVG_NS, "line" );
            tick.setAttribute( "class", "ruler-tick" );
            tick.setAttribute( "x1", String( x ) );
            tick.setAttribute( "y1", "1" );
            tick.setAttribute( "x2", String( x ) );
            tick.setAttribute( "y2", major ? "6" : "4" );
            rulerEl.appendChild( tick );
            if( major ) {
                const text = document.createElementNS( SVG_NS, "text" );
                text.setAttribute( "x", String( x ) );
                text.setAttribute( "y", "13" );
                text.textContent = fmtMeters( x / UNIT );
                rulerEl.appendChild( text );
            }
        }
    }

    function ensure( count ) {
        const len = trailLenFor( count );
        if( count === nAgents && len === trailLen && trailPts ) return;
        nAgents = count;
        trailLen = len;
        obsBuf = new Float32Array( count * 4 );
        donesBuf = new Uint8Array( count );
        prevDone = new Uint8Array( count );
        alphas = new Float32Array( count );
        gx = new Float32Array( count );
        gy = new Float32Array( count );
        gtx = new Float32Array( count );
        gty = new Float32Array( count );
        trailPts = new Float32Array( count * len * 2 );
        trailHead = new Uint16Array( count );
        trailCount = new Uint16Array( count );
    }

    function findHero( count ) {
        if( !heroObs ) return -1;
        for( let i = 0; i < count; i++ ) {
            const o = i * 4;
            if( obsBuf[ o ] === heroObs[ 0 ] && obsBuf[ o + 1 ] === heroObs[ 1 ]
                && obsBuf[ o + 2 ] === heroObs[ 2 ] && obsBuf[ o + 3 ] === heroObs[ 3 ] ) return i;
        }
        return 0;
    }

    function pushTrail( i ) {
        const len = trailLen;
        const u = obsBuf[ i * 4 ] * UNIT;
        const th = obsBuf[ i * 4 + 2 ];
        const x = u + POLE_LEN * Math.sin( th );
        const y = -POLE_LEN * Math.cos( th );
        const h = trailHead[ i ];
        const p = ( i * len + h ) * 2;
        trailPts[ p ] = x;
        trailPts[ p + 1 ] = y;
        trailHead[ i ] = h + 1 >= len ? 0 : h + 1;
        if( trailCount[ i ] < len ) trailCount[ i ]++;
    }

    function layout() {
        if( !canvas || !stageSvg ) return;
        const rect = stageSvg.getBoundingClientRect();
        if( !rect.width || !rect.height ) return;
        let left = rect.left;
        let top = rect.top;
        const parent = canvas.offsetParent;
        if( parent ) {
            const pr = parent.getBoundingClientRect();
            left = rect.left - pr.left - parent.clientLeft;
            top = rect.top - pr.top - parent.clientTop;
        }
        const w = Math.round( rect.width );
        const h = Math.round( rect.height );
        const ratio = typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
        if( canvas.style.position !== "absolute" ) canvas.style.position = "absolute";
        canvas.style.left = left + "px";
        canvas.style.top = top + "px";
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        canvas.style.pointerEvents = "none";
        const bw = Math.max( 1, Math.round( w * ratio ) );
        const bh = Math.max( 1, Math.round( h * ratio ) );
        if( canvas.width !== bw || canvas.height !== bh ) {
            canvas.width = bw;
            canvas.height = bh;
        }
        cssW = w;
        cssH = h;
        dpr = ratio;
    }

    function draw() {
        if( !ctx || !stageSvg || !inited ) return;
        const rect = stageSvg.getBoundingClientRect();
        if( !rect.width || !rect.height ) return;
        if( Math.round( rect.width ) !== cssW || Math.round( rect.height ) !== cssH ) layout();
        const ctm = stageSvg.getScreenCTM();
        if( !ctm ) return;
        const crect = canvas.getBoundingClientRect();
        const ax = ctm.a;
        const ay = ctm.d;
        const ox = ctm.e - crect.left;
        const oy = ctm.f - crect.top;
        const count = nAgents;
        const hero = heroIdx;
        ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
        ctx.clearRect( 0, 0, cssW, cssH );
        if( count < 2 ) return;
        const bobU = count <= 32 ? 5 : count <= 256 ? 3.5 : 2.5;
        const poleU = count <= 256 ? 1.4 : 1;
        const bobR = bobU * ax;
        const poleW = Math.max( 0.7, poleU * ax );
        for( let i = 0; i < count; i++ ) {
            if( i === hero || alphas[ i ] <= 0 ) continue;
            const u = obsBuf[ i * 4 ] * UNIT;
            const th = obsBuf[ i * 4 + 2 ];
            gx[ i ] = ox + ax * u;
            gy[ i ] = oy;
            gtx[ i ] = ox + ax * ( u + POLE_LEN * Math.sin( th ) );
            gty[ i ] = oy + ay * ( -POLE_LEN * Math.cos( th ) );
        }
        if( trailsOn && trailLen > 1 ) {
            const len = trailLen;
            ctx.lineCap = "round";
            ctx.lineWidth = Math.max( 0.6, 0.9 * ax );
            for( let b = 0; b < TRAIL_BUCKETS; b++ ) {
                let any = false;
                ctx.beginPath();
                for( let i = 0; i < count; i++ ) {
                    if( i === hero || alphas[ i ] <= 0 ) continue;
                    const cnt = trailCount[ i ];
                    if( cnt < 2 ) continue;
                    const segs = cnt - 1;
                    let lo = Math.ceil( b * segs / TRAIL_BUCKETS );
                    let hi = Math.ceil( ( b + 1 ) * segs / TRAIL_BUCKETS ) - 1;
                    if( lo < 0 ) lo = 0;
                    if( hi > segs - 1 ) hi = segs - 1;
                    if( lo > hi ) continue;
                    let base = trailHead[ i ] - cnt;
                    if( base < 0 ) base += len;
                    for( let j = lo; j <= hi; j++ ) {
                        let s0 = base + j;
                        if( s0 >= len ) s0 -= len;
                        let s1 = s0 + 1;
                        if( s1 >= len ) s1 -= len;
                        const p0 = ( i * len + s0 ) * 2;
                        const p1 = ( i * len + s1 ) * 2;
                        ctx.moveTo( ox + ax * trailPts[ p0 ], oy + ay * trailPts[ p0 + 1 ] );
                        ctx.lineTo( ox + ax * trailPts[ p1 ], oy + ay * trailPts[ p1 + 1 ] );
                    }
                    any = true;
                }
                if( any ) {
                    ctx.strokeStyle = TRAIL_COLORS[ b ];
                    ctx.stroke();
                }
            }
        }
        ctx.lineCap = "round";
        for( let b = 0; b < ALPHA_BUCKETS; b++ ) {
            let any = false;
            ctx.beginPath();
            for( let i = 0; i < count; i++ ) {
                if( i === hero || alphas[ i ] <= 0 ) continue;
                let bi = ( alphas[ i ] * ALPHA_BUCKETS ) | 0;
                if( bi > ALPHA_BUCKETS - 1 ) bi = ALPHA_BUCKETS - 1;
                if( bi !== b ) continue;
                ctx.moveTo( gx[ i ], gy[ i ] );
                ctx.lineTo( gtx[ i ], gty[ i ] );
                any = true;
            }
            if( any ) {
                ctx.strokeStyle = POLE_COLORS[ b ];
                ctx.lineWidth = poleW;
                ctx.stroke();
            }
            any = false;
            ctx.beginPath();
            for( let i = 0; i < count; i++ ) {
                if( i === hero || alphas[ i ] <= 0 ) continue;
                let bi = ( alphas[ i ] * ALPHA_BUCKETS ) | 0;
                if( bi > ALPHA_BUCKETS - 1 ) bi = ALPHA_BUCKETS - 1;
                if( bi !== b ) continue;
                ctx.moveTo( gtx[ i ] + bobR, gty[ i ] );
                ctx.arc( gtx[ i ], gty[ i ], bobR, 0, TAU );
                any = true;
            }
            if( any ) {
                ctx.fillStyle = BOB_COLORS[ b ];
                ctx.fill();
            }
        }
    }

    function scheduleDraw() {
        if( typeof requestAnimationFrame === "undefined" ) return;
        if( drawQueued ) return;
        drawQueued = true;
        requestAnimationFrame( function () {
            drawQueued = false;
            draw();
        } );
    }

    function hookEvents() {
        if( hooksBound ) return;
        hooksBound = true;
        if( typeof window !== "undefined" && window.addEventListener ) window.addEventListener( "resize", layout );
        if( typeof ResizeObserver !== "undefined" ) {
            try {
                resizeObs = new ResizeObserver( layout );
                resizeObs.observe( stageSvg );
            } catch ( e ) {}
        }
    }

    function init() {
        if( typeof document === "undefined" ) return;
        stageSvg = document.getElementById( "stage-svg" );
        rulerEl = document.getElementById( "ruler" );
        canvas = document.getElementById( "ghost-canvas" );
        drives = [];
        addDrive( stageSvg );
        addDrive( document.getElementById( "stage-shadow" ) );
        buildRuler();
        ctx = canvas && canvas.getContext ? canvas.getContext( "2d" ) : null;
        inited = true;
        if( heroObs ) {
            heroTx = null;
            heroDeg = null;
            setHero( heroObs );
        }
        if( ctx && stageSvg ) {
            layout();
            hookEvents();
        }
    }

    function setAgents( obsFloat32N, dones ) {
        if( !inited || !obsFloat32N ) return;
        const count = obsFloat32N.length >> 2;
        if( count < 1 ) return;
        ensure( count );
        obsBuf.set( obsFloat32N.subarray( 0, count * 4 ) );
        if( dones && dones.length >= count ) {
            for( let i = 0; i < count; i++ ) donesBuf[ i ] = dones[ i ] ? 1 : 0;
        } else {
            donesBuf.fill( 0 );
        }
        heroIdx = findHero( count );
        if( !trailsOn && trailCount ) trailCount.fill( 0 );
        for( let i = 0; i < count; i++ ) {
            if( donesBuf[ i ] ) {
                alphas[ i ] -= FADE_OUT;
                if( alphas[ i ] < 0 ) alphas[ i ] = 0;
            } else {
                if( prevDone[ i ] ) {
                    trailHead[ i ] = 0;
                    trailCount[ i ] = 0;
                    alphas[ i ] = 0;
                }
                if( alphas[ i ] < 1 ) {
                    alphas[ i ] += FADE_IN;
                    if( alphas[ i ] > 1 ) alphas[ i ] = 1;
                }
                if( trailsOn ) pushTrail( i );
            }
            prevDone[ i ] = donesBuf[ i ];
        }
        scheduleDraw();
    }

    function setHero( obs4 ) {
        if( !obs4 || obs4.length < 4 ) return;
        if( !heroObs ) heroObs = new Float32Array( 4 );
        for( let i = 0; i < 4; i++ ) heroObs[ i ] = obs4[ i ];
        const tx = fmt( obs4[ 0 ] * UNIT );
        const deg = fmt( obs4[ 2 ] * RAD2DEG );
        if( tx === heroTx && deg === heroDeg ) return;
        heroTx = tx;
        heroDeg = deg;
        const move = "translate(" + tx + "px, 0px)";
        const turn = move + " rotate(" + deg + "deg)";
        for( let d = 0; d < drives.length; d++ ) {
            applyAll( drives[ d ].rotate, turn );
            applyAll( drives[ d ].slide, move );
        }
    }

    function setGhostTrails( enabled ) {
        trailsOn = !!enabled;
        if( trailCount ) trailCount.fill( 0 );
    }

    const stage = { init, setAgents, setHero, setGhostTrails };

    if( typeof window !== "undefined" ) ( window.RL ||= {} ).stage = stage;
    if( typeof module !== "undefined" ) module.exports = { stage };

})();
