( function () {

    "use strict";

    const SVG_NS = "http://www.w3.org/2000/svg";
    const PAD_L = 46;
    const PAD_R = 92;
    const PAD_T = 14;
    const PAD_B = 34;
    const BAR_MAX = 56;
    const BAR_H = 10;
    const EDGE_BUCKETS = 8;
    const EDGE_W_MIN = 0.3;
    const EDGE_W_MAX = 2.6;
    const EDGE_A_MIN = 0.06;
    const EDGE_A_MAX = 0.24;
    const POS_RGB = "140,188,229";
    const NEG_RGB = "99,135,167";
    const DEF_IN = [ "x", "ẋ", "θ", "θ̇" ];
    const DEF_OUT = [ "←", "→" ];

    let inited = false;
    let container = null;
    let canvas = null;
    let ctx = null;
    let svg = null;
    let statsEl = null;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let arch = null;
    let mats = null;
    let inLabels = DEF_IN;
    let outLabels = DEF_OUT;
    let cols = [];
    let tracks = [];
    let barFills = [];
    let outLabelEls = [];
    let maxAbsW = 1;
    let lastObs = null;
    let lastFrame = null;

    function linScale( d0, d1, r0, r1 ) {
        if( typeof d3 !== "undefined" && d3 && typeof d3.scaleLinear === "function" ) {
            return d3.scaleLinear().domain( [ d0, d1 ] ).range( [ r0, r1 ] );
        }
        return function ( v ) {
            const den = d1 - d0 || 1;
            return r0 + ( r1 - r0 ) * ( v - d0 ) / den;
        };
    }

    function clamp( v, lo, hi ) {
        return v < lo ? lo : v > hi ? hi : v;
    }

    function fillFor( a ) {
        if( !isFinite( a ) ) a = 0;
        a = clamp( a, -1, 1 );
        return {
            color: a >= 0 ? "#8CBCE5" : "#6387A7",
            alpha: 0.5 + 0.5 * Math.abs( a )
        };
    }

    function svgEl( tag, parent ) {
        const e = document.createElementNS( SVG_NS, tag );
        if( parent ) parent.appendChild( e );
        return e;
    }

    function measure() {
        if( !container || !canvas || !svg ) return false;
        const rect = container.getBoundingClientRect();
        const w = Math.round( rect.width ) || 640;
        const h = Math.round( rect.height ) || 320;
        const ratio = typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
        W = w;
        H = h;
        dpr = ratio;
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        const bw = Math.max( 1, Math.round( w * ratio ) );
        const bh = Math.max( 1, Math.round( h * ratio ) );
        if( canvas.width !== bw || canvas.height !== bh ) {
            canvas.width = bw;
            canvas.height = bh;
        }
        svg.setAttribute( "width", w );
        svg.setAttribute( "height", h );
        return true;
    }

    function computePositions() {
        cols = [];
        if( !arch ) return;
        const last = arch.length - 1;
        const x = linScale( 0, last, PAD_L, W - PAD_R );
        for( let l = 0; l <= last; l++ ) {
            const n = arch[ l ];
            const y = n > 1 ? linScale( 0, n - 1, PAD_T, H - PAD_B )
                : function () { return PAD_T + ( H - PAD_T - PAD_B ) / 2; };
            const spacing = n > 1 ? ( H - PAD_T - PAD_B ) / ( n - 1 ) : 0;
            const r = clamp( spacing * 0.4, 2.4, l === 0 ? 7 : 5.5 );
            const col = [];
            for( let i = 0; i < n; i++ ) {
                col.push( { cx: x( l ), cy: y( i ), r: r, el: null, label: null } );
            }
            cols.push( col );
        }
    }

    function restoreRefs( prevCols ) {
        if( !prevCols ) return;
        for( let l = 0; l < cols.length && l < prevCols.length; l++ ) {
            for( let i = 0; i < cols[ l ].length && i < prevCols[ l ].length; i++ ) {
                cols[ l ][ i ].el = prevCols[ l ][ i ].el;
                cols[ l ][ i ].label = prevCols[ l ][ i ].label;
            }
        }
    }

    function createEls() {
        while( svg.firstChild ) svg.removeChild( svg.firstChild );
        tracks = [];
        barFills = [];
        outLabelEls = [];
        const last = arch.length - 1;
        for( let l = 0; l <= last; l++ ) {
            const n = arch[ l ];
            for( let i = 0; i < n; i++ ) {
                const p = cols[ l ][ i ];
                if( l === last ) {
                    const track = svgEl( "rect", svg );
                    track.setAttribute( "x", String( p.cx + 7 ) );
                    track.setAttribute( "y", String( p.cy - BAR_H / 2 ) );
                    track.setAttribute( "width", String( BAR_MAX ) );
                    track.setAttribute( "height", String( BAR_H ) );
                    track.setAttribute( "rx", "2" );
                    track.setAttribute( "fill", "rgba(99,135,167,0.12)" );
                    const bar = svgEl( "rect", svg );
                    bar.setAttribute( "x", String( p.cx + 7 ) );
                    bar.setAttribute( "y", String( p.cy - BAR_H / 2 ) );
                    bar.setAttribute( "width", "0" );
                    bar.setAttribute( "height", String( BAR_H ) );
                    bar.setAttribute( "rx", "2" );
                    bar.setAttribute( "fill", "#8CBCE5" );
                    const lab = svgEl( "text", svg );
                    lab.setAttribute( "x", String( p.cx + 7 + BAR_MAX + 6 ) );
                    lab.setAttribute( "y", String( p.cy ) );
                    lab.setAttribute( "font-size", "11" );
                    lab.setAttribute( "text-anchor", "start" );
                    lab.setAttribute( "dominant-baseline", "middle" );
                    lab.setAttribute( "fill", "#6387A7" );
                    lab.textContent = i < outLabels.length ? outLabels[ i ] : String( i );
                    tracks.push( track );
                    barFills.push( bar );
                    outLabelEls.push( lab );
                } else {
                    const c = svgEl( "circle", svg );
                    c.setAttribute( "cx", String( p.cx ) );
                    c.setAttribute( "cy", String( p.cy ) );
                    c.setAttribute( "r", String( p.r ) );
                    c.setAttribute( "fill", "#8CBCE5" );
                    c.setAttribute( "fill-opacity", "0.500" );
                    c.setAttribute( "stroke", "rgba(99,135,167,0.35)" );
                    c.setAttribute( "stroke-width", "0.6" );
                    p.el = c;
                    if( l === 0 ) {
                        const t = svgEl( "text", svg );
                        t.setAttribute( "x", String( p.cx - p.r - 6 ) );
                        t.setAttribute( "y", String( p.cy ) );
                        t.setAttribute( "font-size", "11" );
                        t.setAttribute( "text-anchor", "end" );
                        t.setAttribute( "dominant-baseline", "middle" );
                        t.setAttribute( "fill", "#6387A7" );
                        t.textContent = i < inLabels.length ? inLabels[ i ] : String( i );
                        p.label = t;
                    }
                }
            }
        }
    }

    function positionEls() {
        const last = arch.length - 1;
        for( let l = 0; l <= last; l++ ) {
            const n = arch[ l ];
            for( let i = 0; i < n; i++ ) {
                const p = cols[ l ][ i ];
                if( l === last ) {
                    if( !tracks[ i ] ) continue;
                    tracks[ i ].setAttribute( "x", String( p.cx + 7 ) );
                    tracks[ i ].setAttribute( "y", String( p.cy - BAR_H / 2 ) );
                    barFills[ i ].setAttribute( "x", String( p.cx + 7 ) );
                    barFills[ i ].setAttribute( "y", String( p.cy - BAR_H / 2 ) );
                    outLabelEls[ i ].setAttribute( "x", String( p.cx + 7 + BAR_MAX + 6 ) );
                    outLabelEls[ i ].setAttribute( "y", String( p.cy ) );
                } else {
                    if( !p.el ) continue;
                    p.el.setAttribute( "cx", String( p.cx ) );
                    p.el.setAttribute( "cy", String( p.cy ) );
                    p.el.setAttribute( "r", String( p.r ) );
                    if( p.label ) {
                        p.label.setAttribute( "x", String( p.cx - p.r - 6 ) );
                        p.label.setAttribute( "y", String( p.cy ) );
                    }
                }
            }
        }
    }

    function drawEdges() {
        if( !ctx || !arch || !W ) return;
        ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
        ctx.clearRect( 0, 0, W, H );
        const groups = {};
        for( let l = 0; l < arch.length - 1; l++ ) {
            const from = cols[ l ];
            const to = cols[ l + 1 ];
            const m = mats[ l ];
            if( !m ) continue;
            for( let j = 0; j < m.length; j++ ) {
                const row = m[ j ];
                for( let i = 0; i < row.length; i++ ) {
                    const w = row[ i ];
                    const ratio = Math.abs( w ) / maxAbsW;
                    let b = Math.floor( ratio * EDGE_BUCKETS );
                    if( b > EDGE_BUCKETS - 1 ) b = EDGE_BUCKETS - 1;
                    const key = ( w < 0 ? "n" : "p" ) + b;
                    if( !groups[ key ] ) groups[ key ] = [];
                    groups[ key ].push( from[ i ].cx, from[ i ].cy, to[ j ].cx, to[ j ].cy );
                }
            }
        }
        for( const key in groups ) {
            const neg = key.charAt( 0 ) === "n";
            const b = Number( key.slice( 1 ) );
            const ratio = ( b + 0.5 ) / EDGE_BUCKETS;
            const g = groups[ key ];
            ctx.beginPath();
            for( let k = 0; k < g.length; k += 4 ) {
                ctx.moveTo( g[ k ], g[ k + 1 ] );
                ctx.lineTo( g[ k + 2 ], g[ k + 3 ] );
            }
            const alpha = EDGE_A_MIN + ( EDGE_A_MAX - EDGE_A_MIN ) * ratio;
            ctx.strokeStyle = "rgba(" + ( neg ? NEG_RGB : POS_RGB ) + "," + alpha.toFixed( 3 ) + ")";
            ctx.lineWidth = EDGE_W_MIN + ( EDGE_W_MAX - EDGE_W_MIN ) * ratio;
            ctx.stroke();
        }
    }

    function applyFrame( obs, frame ) {
        if( !arch || !cols.length ) return;
        const last = arch.length - 1;
        for( let i = 0; i < arch[ 0 ] && i < obs.length; i++ ) {
            const p = cols[ 0 ][ i ];
            if( !p.el ) continue;
            const s = fillFor( Math.tanh( obs[ i ] ) );
            p.el.setAttribute( "fill", s.color );
            p.el.setAttribute( "fill-opacity", s.alpha.toFixed( 3 ) );
        }
        const acts = frame ? frame.activations : null;
        if( acts ) {
            for( let l = 1; l < last; l++ ) {
                const a = acts[ l - 1 ];
                if( !a ) continue;
                for( let i = 0; i < arch[ l ]; i++ ) {
                    const p = cols[ l ][ i ];
                    if( !p.el || a[ i ] === undefined ) continue;
                    const s = fillFor( a[ i ] );
                    p.el.setAttribute( "fill", s.color );
                    p.el.setAttribute( "fill-opacity", s.alpha.toFixed( 3 ) );
                }
            }
        }
        let probs = frame ? frame.probs : null;
        if( ( !probs || probs.length < arch[ last ] ) && acts && acts.length >= last ) {
            probs = acts[ acts.length - 1 ];
        }
        let win = frame ? frame.action : undefined;
        if( ( win === undefined || win === null ) && probs ) {
            win = 0;
            for( let i = 1; i < probs.length; i++ ) if( probs[ i ] > probs[ win ] ) win = i;
        }
        for( let i = 0; i < arch[ last ]; i++ ) {
            if( !barFills[ i ] ) continue;
            const pr = probs && probs[ i ] !== undefined ? probs[ i ] : 0;
            barFills[ i ].setAttribute( "width", ( clamp( pr, 0, 1 ) * BAR_MAX ).toFixed( 2 ) );
            const winner = i === win;
            barFills[ i ].setAttribute( "fill", winner ? "#8CBCE5" : "rgba(99,135,167,0.35)" );
            outLabelEls[ i ].setAttribute( "font-weight", winner ? "bold" : "normal" );
            outLabelEls[ i ].setAttribute( "fill-opacity", winner ? "1" : "0.6" );
        }
    }

    function layout() {
        if( !inited || !arch || !svg ) return;
        if( !measure() ) return;
        const prev = cols;
        computePositions();
        restoreRefs( prev );
        positionEls();
        drawEdges();
        if( lastObs ) applyFrame( lastObs, lastFrame );
    }

    function hookEvents() {
        if( typeof window !== "undefined" && window.addEventListener ) window.addEventListener( "resize", layout );
        if( typeof ResizeObserver !== "undefined" ) {
            try {
                const ro = new ResizeObserver( layout );
                ro.observe( container );
            } catch ( e ) {}
        }
    }

    function init() {
        if( typeof document === "undefined" || inited ) return;
        container = document.getElementById( "nn-container" );
        if( !container ) return;
        if( !container.style.position ) container.style.position = "relative";
        canvas = document.createElement( "canvas" );
        canvas.style.position = "absolute";
        canvas.style.left = "0px";
        canvas.style.top = "0px";
        canvas.style.pointerEvents = "none";
        container.appendChild( canvas );
        svg = svgEl( "svg", container );
        svg.style.position = "absolute";
        svg.style.left = "0px";
        svg.style.top = "0px";
        svg.style.pointerEvents = "none";
        statsEl = document.createElement( "div" );
        statsEl.style.position = "absolute";
        statsEl.style.left = "8px";
        statsEl.style.bottom = "5px";
        statsEl.style.fontFamily = "'Spartan', sans-serif";
        statsEl.style.fontSize = "1rem";
        statsEl.style.color = "#6387A7";
        statsEl.style.pointerEvents = "none";
        container.appendChild( statsEl );
        ctx = canvas.getContext ? canvas.getContext( "2d" ) : null;
        inited = true;
        hookEvents();
    }

    function setPolicy( policyJson ) {
        if( !policyJson || !policyJson.arch || !policyJson.W ) return;
        if( !inited ) init();
        if( !svg || !statsEl ) return;
        arch = policyJson.arch.slice();
        mats = policyJson.W;
        inLabels = policyJson.inputLabels && policyJson.inputLabels.length
            ? policyJson.inputLabels.slice() : DEF_IN.slice();
        outLabels = policyJson.outputLabels && policyJson.outputLabels.length
            ? policyJson.outputLabels.slice() : DEF_OUT.slice();
        maxAbsW = 1e-9;
        for( let l = 0; l < mats.length; l++ ) {
            const m = mats[ l ];
            for( let j = 0; j < m.length; j++ ) {
                const row = m[ j ];
                for( let i = 0; i < row.length; i++ ) {
                    const a = Math.abs( row[ i ] );
                    if( a > maxAbsW ) maxAbsW = a;
                }
            }
        }
        let weights = 0;
        for( let l = 0; l < mats.length; l++ ) {
            for( let j = 0; j < mats[ l ].length; j++ ) weights += mats[ l ][ j ].length;
        }
        let extra = 0;
        if( policyJson.b && policyJson.b.length ) {
            for( let l = 0; l < policyJson.b.length - 1; l++ ) extra += policyJson.b[ l ].length;
        } else {
            for( let l = 1; l < arch.length - 1; l++ ) extra += arch[ l ];
        }
        let hidden = 0;
        for( let l = 1; l < arch.length - 1; l++ ) hidden += arch[ l ];
        statsEl.textContent = "Hidden nodes: " + hidden + " · Connections: " + ( weights + extra );
        if( !measure() ) return;
        computePositions();
        createEls();
        drawEdges();
        if( lastObs ) applyFrame( lastObs, lastFrame );
    }

    function update( obs4, frame ) {
        if( !inited || !arch || !obs4 ) return;
        lastObs = new Float32Array( 4 );
        const n = Math.min( 4, obs4.length );
        for( let i = 0; i < n; i++ ) lastObs[ i ] = obs4[ i ];
        lastFrame = frame || null;
        applyFrame( lastObs, lastFrame );
    }

    const nnviz = { init, setPolicy, update };

    if( typeof window !== "undefined" ) ( window.RL ||= {} ).nnviz = nnviz;
    if( typeof module !== "undefined" ) module.exports = { nnviz };

})();
