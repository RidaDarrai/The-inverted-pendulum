( function () {

    "use strict";

    const SVG_NS = "http://www.w3.org/2000/svg";
    const PAD_S = { l: 54, r: 16, t: 30, b: 26 };
    const PAD_T = { l: 54, r: 16, t: 54, b: 26 };
    const Y_TICKS = 4;
    const X_TICKS = 5;
    const SCORE_CAP = 5000;
    const TELE_CAP = 500;
    const FONT = 16;
    const BEST_C = "#6387A7";
    const MEAN_C = "#8CBCE5";
    const AREA_C = "rgba(140,188,229,0.35)";
    const GRID_C = "rgba(99,135,167,0.15)";
    const AXIS_C = "rgba(99,135,167,0.45)";

    let scoreBox = null;
    let scoreSvg = null;
    let scoreParts = null;
    let scoreData = [];

    let teleBox = null;
    let teleSvg = null;
    let teleParts = null;
    const teleArr = new Array( TELE_CAP );
    let teleHead = 0;
    let teleCount = 0;

    function mk( tag, parent ) {
        const e = document.createElementNS( SVG_NS, tag );
        if( parent ) parent.appendChild( e );
        return e;
    }

    function observe( el, fn ) {
        if( typeof ResizeObserver !== "undefined" ) {
            try {
                const ro = new ResizeObserver( fn );
                ro.observe( el );
            } catch ( e ) {}
        }
        if( typeof window !== "undefined" && window.addEventListener ) window.addEventListener( "resize", fn );
    }

    function niceNum( x, round ) {
        if( !( x > 0 ) ) return 1;
        const exp = Math.floor( Math.log( x ) / Math.LN10 );
        const f = x / Math.pow( 10, exp );
        let nf;
        if( round ) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
        else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
        return nf * Math.pow( 10, exp );
    }

    function tickSet( min, max, n ) {
        if( !isFinite( min ) || !isFinite( max ) ) {
            min = 0;
            max = 1;
        }
        if( min === max ) {
            const pad = Math.abs( min ) * 0.05 + 0.5;
            min -= pad;
            max += pad;
        }
        const step = niceNum( niceNum( max - min, false ) / ( n - 1 ), true );
        const lo = Math.floor( min / step ) * step;
        const hi = Math.ceil( max / step ) * step;
        const vals = [];
        for( let v = lo; v <= hi + step * 1e-9; v += step ) {
            const r = Math.round( v * 1e6 ) / 1e6;
            vals.push( r === 0 ? 0 : r );
        }
        return { lo: lo, hi: hi, step: step, vals: vals };
    }

    function scale( d0, d1, r0, r1 ) {
        const den = d1 - d0 || 1;
        return function ( v ) {
            return r0 + ( r1 - r0 ) * ( v - d0 ) / den;
        };
    }

    function fmtDec( v, step ) {
        let dec = 0;
        if( step > 0 && step < 1 ) dec = Math.min( 3, Math.ceil( -Math.log( step ) / Math.LN10 ) );
        return v.toFixed( dec );
    }

    function pool( arr, n, tag, parent ) {
        while( arr.length < n ) arr.push( mk( tag, parent ) );
        while( arr.length > n ) parent.removeChild( arr.pop() );
        return arr;
    }

    function linePath( pts, sx, sy ) {
        let d = "";
        for( let i = 0; i < pts.length; i++ ) {
            d += ( i ? "L" : "M" ) + sx( pts[ i ].x ).toFixed( 2 ) + " " + sy( pts[ i ].y ).toFixed( 2 );
        }
        return d;
    }

    function areaPath( pts, sx, sy, baseY ) {
        if( !pts.length ) return "";
        let d = "M" + sx( pts[ 0 ].x ).toFixed( 2 ) + " " + baseY.toFixed( 2 );
        for( let i = 0; i < pts.length; i++ ) {
            d += "L" + sx( pts[ i ].x ).toFixed( 2 ) + " " + sy( pts[ i ].y ).toFixed( 2 );
        }
        d += "L" + sx( pts[ pts.length - 1 ].x ).toFixed( 2 ) + " " + baseY.toFixed( 2 ) + "Z";
        return d;
    }

    function measure( box, svg, dw, dh ) {
        const rect = box.getBoundingClientRect();
        const w = Math.round( rect.width ) || dw;
        const h = Math.round( rect.height ) || dh;
        svg.setAttribute( "viewBox", "0 0 " + w + " " + h );
        return { w: w, h: h };
    }

    function setLine( el, x1, y1, x2, y2, stroke, width ) {
        el.setAttribute( "x1", x1.toFixed( 2 ) );
        el.setAttribute( "y1", y1.toFixed( 2 ) );
        el.setAttribute( "x2", x2.toFixed( 2 ) );
        el.setAttribute( "y2", y2.toFixed( 2 ) );
        el.setAttribute( "stroke", stroke );
        el.setAttribute( "stroke-width", String( width ) );
    }

    function setText( el, x, y, text, anchor ) {
        el.setAttribute( "x", x.toFixed( 2 ) );
        el.setAttribute( "y", y.toFixed( 2 ) );
        el.setAttribute( "font-size", String( FONT ) );
        el.setAttribute( "text-anchor", anchor );
        el.setAttribute( "fill", BEST_C );
        el.textContent = text;
    }

    function renderScore() {
        if( !scoreParts || !scoreBox ) return;
        const m = measure( scoreBox, scoreSvg, 600, 220 );
        const P = PAD_S;
        const parts = scoreParts;
        const data = scoreData;
        const baseY = m.h - P.b;
        setLine( parts.axisLine, P.l, baseY, m.w - P.r, baseY, AXIS_C, 1 );
        parts.readout.setAttribute( "x", String( m.w - P.r ) );
        parts.readout.setAttribute( "y", "18" );
        if( !data.length ) {
            parts.area.setAttribute( "d", "" );
            parts.meanP.setAttribute( "d", "" );
            parts.bestP.setAttribute( "d", "" );
            parts.readout.textContent = "";
            pool( parts.yLines, 0, "line", parts.gridG );
            pool( parts.yTexts, 0, "text", parts.labelsG );
            pool( parts.xTexts, 0, "text", parts.labelsG );
            return;
        }
        let xmin = data[ 0 ].x;
        let xmax = data[ 0 ].x;
        let ymin = Infinity;
        let ymax = -Infinity;
        for( let i = 0; i < data.length; i++ ) {
            const d = data[ i ];
            if( d.x < xmin ) xmin = d.x;
            if( d.x > xmax ) xmax = d.x;
            if( d.mean < ymin ) ymin = d.mean;
            if( d.best < ymin ) ymin = d.best;
            if( d.mean > ymax ) ymax = d.mean;
            if( d.best > ymax ) ymax = d.best;
        }
        if( xmin === xmax ) {
            xmin -= 1;
            xmax += 1;
        }
        const ty = tickSet( ymin, ymax, Y_TICKS );
        const sx = scale( xmin, xmax, P.l, m.w - P.r );
        const sy = scale( ty.lo, ty.hi, baseY, P.t );
        const yLines = pool( parts.yLines, ty.vals.length, "line", parts.gridG );
        const yTexts = pool( parts.yTexts, ty.vals.length, "text", parts.labelsG );
        for( let i = 0; i < ty.vals.length; i++ ) {
            const y = sy( ty.vals[ i ] );
            setLine( yLines[ i ], P.l, y, m.w - P.r, y, GRID_C, 1 );
            setText( yTexts[ i ], P.l - 8, y + 5.5, fmtDec( ty.vals[ i ], ty.step ), "end" );
        }
        const xStep = ( xmax - xmin ) / ( X_TICKS - 1 );
        const xTexts = pool( parts.xTexts, X_TICKS, "text", parts.labelsG );
        for( let i = 0; i < X_TICKS; i++ ) {
            const xv = xmin + i * xStep;
            setText( xTexts[ i ], sx( xv ), baseY + FONT, fmtDec( xv, xStep ), "middle" );
        }
        const meanPts = [];
        const bestPts = [];
        for( let i = 0; i < data.length; i++ ) {
            meanPts.push( { x: data[ i ].x, y: data[ i ].mean } );
            bestPts.push( { x: data[ i ].x, y: data[ i ].best } );
        }
        parts.area.setAttribute( "d", areaPath( meanPts, sx, sy, baseY ) );
        parts.meanP.setAttribute( "d", linePath( meanPts, sx, sy ) );
        parts.bestP.setAttribute( "d", linePath( bestPts, sx, sy ) );
        parts.readout.textContent = "best " + data[ data.length - 1 ].best.toFixed( 1 );
    }

    function initScore() {
        if( typeof document === "undefined" || scoreParts ) return;
        scoreBox = document.getElementById( "score-container" );
        if( !scoreBox ) return;
        scoreSvg = mk( "svg", scoreBox );
        scoreSvg.style.width = "100%";
        scoreSvg.style.height = "100%";
        scoreSvg.style.display = "block";
        const parts = {
            gridG: mk( "g", scoreSvg ),
            area: mk( "path", scoreSvg ),
            meanP: mk( "path", scoreSvg ),
            bestP: mk( "path", scoreSvg ),
            labelsG: mk( "g", scoreSvg ),
            readout: mk( "text", scoreSvg ),
            yLines: [],
            yTexts: [],
            xTexts: []
        };
        parts.area.setAttribute( "fill", AREA_C );
        parts.area.setAttribute( "stroke", "none" );
        parts.meanP.setAttribute( "fill", "none" );
        parts.meanP.setAttribute( "stroke", MEAN_C );
        parts.meanP.setAttribute( "stroke-width", "2" );
        parts.meanP.setAttribute( "stroke-linejoin", "round" );
        parts.bestP.setAttribute( "fill", "none" );
        parts.bestP.setAttribute( "stroke", BEST_C );
        parts.bestP.setAttribute( "stroke-width", "2" );
        parts.bestP.setAttribute( "stroke-linejoin", "round" );
        parts.readout.setAttribute( "text-anchor", "end" );
        parts.readout.setAttribute( "font-size", String( FONT ) );
        parts.readout.setAttribute( "font-weight", "700" );
        parts.readout.setAttribute( "fill", BEST_C );
        parts.axisLine = mk( "line", scoreSvg );
        scoreParts = parts;
        observe( scoreBox, renderScore );
        renderScore();
    }

    function renderTelemetry() {
        if( !teleParts || !teleBox ) return;
        const m = measure( teleBox, teleSvg, 600, 220 );
        const P = PAD_T;
        const parts = teleParts;
        const baseY = m.h - P.b;
        setLine( parts.axisLine, P.l, baseY, m.w - P.r, baseY, AXIS_C, 1 );
        if( !teleCount ) {
            parts.speedP.setAttribute( "d", "" );
            parts.thetaP.setAttribute( "d", "" );
            pool( parts.yLines, 0, "line", parts.gridG );
            pool( parts.yTexts, 0, "text", parts.labelsG );
            pool( parts.xTexts, 0, "text", parts.labelsG );
            return;
        }
        const pts = [];
        for( let i = 0; i < teleCount; i++ ) pts.push( teleArr[ ( teleHead + i ) % TELE_CAP ] );
        let xmin = pts[ 0 ].t;
        let xmax = pts[ pts.length - 1 ].t;
        let ymin = Infinity;
        let ymax = -Infinity;
        for( let i = 0; i < pts.length; i++ ) {
            const p = pts[ i ];
            if( p.speed < ymin ) ymin = p.speed;
            if( p.theta < ymin ) ymin = p.theta;
            if( p.speed > ymax ) ymax = p.speed;
            if( p.theta > ymax ) ymax = p.theta;
        }
        if( xmin === xmax ) {
            xmin -= 0.5;
            xmax += 0.5;
        }
        const ty = tickSet( ymin, ymax, Y_TICKS );
        const sx = scale( xmin, xmax, P.l, m.w - P.r );
        const sy = scale( ty.lo, ty.hi, baseY, P.t );
        const yLines = pool( parts.yLines, ty.vals.length, "line", parts.gridG );
        const yTexts = pool( parts.yTexts, ty.vals.length, "text", parts.labelsG );
        for( let i = 0; i < ty.vals.length; i++ ) {
            const y = sy( ty.vals[ i ] );
            setLine( yLines[ i ], P.l, y, m.w - P.r, y, GRID_C, 1 );
            setText( yTexts[ i ], P.l - 8, y + 5.5, fmtDec( ty.vals[ i ], ty.step ), "end" );
        }
        const xStep = ( xmax - xmin ) / ( X_TICKS - 1 );
        const xTexts = pool( parts.xTexts, X_TICKS, "text", parts.labelsG );
        for( let i = 0; i < X_TICKS; i++ ) {
            const xv = xmin + i * xStep;
            setText( xTexts[ i ], sx( xv ), baseY + FONT, fmtDec( xv, xStep ), "middle" );
        }
        const speedPts = [];
        const thetaPts = [];
        for( let i = 0; i < pts.length; i++ ) {
            speedPts.push( { x: pts[ i ].t, y: pts[ i ].speed } );
            thetaPts.push( { x: pts[ i ].t, y: pts[ i ].theta } );
        }
        parts.speedP.setAttribute( "d", linePath( speedPts, sx, sy ) );
        parts.thetaP.setAttribute( "d", linePath( thetaPts, sx, sy ) );
    }

    function initTelemetry() {
        if( typeof document === "undefined" || teleParts ) return;
        teleBox = document.getElementById( "telemetry-container" );
        if( !teleBox ) return;
        teleSvg = mk( "svg", teleBox );
        teleSvg.style.width = "100%";
        teleSvg.style.height = "100%";
        teleSvg.style.display = "block";
        const parts = {
            gridG: mk( "g", teleSvg ),
            speedP: mk( "path", teleSvg ),
            thetaP: mk( "path", teleSvg ),
            labelsG: mk( "g", teleSvg ),
            yLines: [],
            yTexts: [],
            xTexts: []
        };
        parts.speedP.setAttribute( "fill", "none" );
        parts.speedP.setAttribute( "stroke", BEST_C );
        parts.speedP.setAttribute( "stroke-width", "2" );
        parts.speedP.setAttribute( "stroke-linejoin", "round" );
        parts.thetaP.setAttribute( "fill", "none" );
        parts.thetaP.setAttribute( "stroke", MEAN_C );
        parts.thetaP.setAttribute( "stroke-width", "2" );
        parts.thetaP.setAttribute( "stroke-linejoin", "round" );
        parts.axisLine = mk( "line", teleSvg );
        const legend = mk( "g", teleSvg );
        const sw1 = mk( "line", legend );
        setLine( sw1, PAD_T.l, 16, PAD_T.l + 18, 16, BEST_C, 3 );
        const t1 = mk( "text", legend );
        setText( t1, PAD_T.l + 24, 21, "Output (Cart Speed)", "start" );
        const sw2 = mk( "line", legend );
        setLine( sw2, PAD_T.l, 38, PAD_T.l + 18, 38, MEAN_C, 3 );
        const t2 = mk( "text", legend );
        setText( t2, PAD_T.l + 24, 43, "Output (θ)", "start" );
        teleParts = parts;
        observe( teleBox, renderTelemetry );
        renderTelemetry();
    }

    function pushScore( point ) {
        if( !point || !isFinite( point.x ) || !isFinite( point.best ) || !isFinite( point.mean ) ) return;
        if( !scoreParts ) initScore();
        if( !scoreParts ) return;
        scoreData.push( { x: +point.x, best: +point.best, mean: +point.mean } );
        if( scoreData.length > SCORE_CAP ) scoreData.shift();
        renderScore();
    }

    function pushTelemetry( point ) {
        if( !point || !isFinite( point.t ) || !isFinite( point.speed ) || !isFinite( point.theta ) ) return;
        if( !teleParts ) initTelemetry();
        if( !teleParts ) return;
        const p = { t: +point.t, speed: +point.speed, theta: +point.theta };
        if( teleCount < TELE_CAP ) {
            teleArr[ ( teleHead + teleCount ) % TELE_CAP ] = p;
            teleCount++;
        } else {
            teleArr[ teleHead ] = p;
            teleHead = ( teleHead + 1 ) % TELE_CAP;
        }
        renderTelemetry();
    }

    function reset() {
        scoreData = [];
        teleHead = 0;
        teleCount = 0;
        if( scoreParts ) renderScore();
        if( teleParts ) renderTelemetry();
    }

    const charts = { initScore, initTelemetry, pushScore, pushTelemetry, reset };

    if( typeof window !== "undefined" ) ( window.RL ||= {} ).charts = charts;
    if( typeof module !== "undefined" ) module.exports = { charts };

})();
