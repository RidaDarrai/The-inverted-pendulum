const container = document.getElementById( "container" );

let containerScale = 1;

function fitContainerToScreen() {

    containerScale = Math.min(
        1,
        window.innerHeight * 0.9 / container.offsetHeight,
        window.innerWidth  * 0.9 / container.offsetWidth
    );

    container.style.transform = `scale(${containerScale})`;
}

function freezePanelRows() {

    const rows = Array.from( container.children )
        .sort( ( a, b ) => a.offsetTop - b.offsetTop )
        .map( el => {

            const style  = getComputedStyle( el );
            const margin = parseFloat( style.marginTop ) + parseFloat( style.marginBottom );

            if( !el.classList.contains( "control-frame" ) )
                return ( el.offsetHeight + margin ) + "px";

            const content = el.querySelector( ".frame-content" );
            const height  = ( content ? content.offsetHeight : el.offsetHeight )
                          + ( el.offsetHeight - el.clientHeight );

            return ( height + margin ) + "px";
        });

    container.style.gridTemplateRows = rows.join( " " );
}

freezePanelRows();
fitContainerToScreen();
window.addEventListener( "resize", fitContainerToScreen );
document.fonts?.ready.then( () => { freezePanelRows(); fitContainerToScreen(); } );


document.querySelectorAll( ".control-frame" ).forEach( frame => {

    const offset  = { x: 0, y: 0 };
    let dragOrigin = null;

    frame.addEventListener( "pointerdown", evt => {

        if( evt.target.closest( "input, button, a, .resize-handle, .border-resize, #drag-target" ) ) return;

        dragOrigin = { px: evt.clientX, py: evt.clientY, ox: offset.x, oy: offset.y };
        frame.setPointerCapture( evt.pointerId );
        frame.classList.add( "dragging" );
    });

    frame.addEventListener( "pointermove", evt => {

        if( !dragOrigin ) return;

        offset.x = dragOrigin.ox + ( evt.clientX - dragOrigin.px ) / containerScale;
        offset.y = dragOrigin.oy + ( evt.clientY - dragOrigin.py ) / containerScale;

        frame.style.transform = `translate( ${offset.x}px, ${offset.y}px )`;
    });

    const stopDragging = () => {

        dragOrigin = null;
        frame.classList.remove( "dragging" );
    };

    frame.addEventListener( "pointerup",       stopDragging );
    frame.addEventListener( "pointercancel",   stopDragging );


    const handle  = frame.querySelector( ".resize-handle" );
    const content = frame.querySelector( ".frame-content" );

    if( handle && content ) {

        let resizeOrigin = null;
        let startSize    = null;
        let naturalSize  = null;
        let minSize      = null;

        handle.addEventListener( "pointerdown", evt => {

            evt.preventDefault();

            resizeOrigin = { x: evt.clientX, y: evt.clientY };
            startSize    = { w: frame.offsetWidth, h: frame.offsetHeight };
            naturalSize  = { w: content.offsetWidth, h: content.offsetHeight };
            minSize      = { w: parseFloat( getComputedStyle( frame ).minWidth  ) || 240,
                             h: parseFloat( getComputedStyle( frame ).minHeight ) || 80 };

            frame.style.width  = startSize.w + "px";
            frame.style.height = startSize.h + "px";

            handle.setPointerCapture( evt.pointerId );
            frame.classList.add( "dragging" );
        });

        handle.addEventListener( "pointermove", evt => {

            if( !resizeOrigin ) return;

            const maxSize = {
                w: window.innerWidth  / containerScale - 48,
                h: window.innerHeight / containerScale - 48
            };

            const w = Math.min( maxSize.w, Math.max( minSize.w, startSize.w + 2 * ( evt.clientX - resizeOrigin.x ) / containerScale ) );
            const h = Math.min( maxSize.h, Math.max( minSize.h, startSize.h + 2 * ( evt.clientY - resizeOrigin.y ) / containerScale ) );

            frame.style.width  = w + "px";
            frame.style.height = h + "px";

            const contentScale = Math.min( frame.clientWidth  / naturalSize.w,
                                           frame.clientHeight / naturalSize.h );

            content.style.transform = `scale(${contentScale})`;
        });

        const stopResizing = () => {

            if( resizeOrigin ) fitContainerToScreen();

            resizeOrigin = null;
            frame.classList.remove( "dragging" );
        };

        handle.addEventListener( "pointerup",       stopResizing );
        handle.addEventListener( "pointercancel",   stopResizing );
    }
});


// border resize: expand the frame itself (content keeps its scale), growing from the center outward
document.querySelectorAll( ".border-resize" ).forEach( handle => {

    const frame = handle.closest( ".control-frame" );
    const edge  = handle.dataset.edge;

    let origin      = null;
    let startSize   = null;
    let minSize     = null;
    let startMargin = null;
    let shiftResize = false;

    const marginSide = { right: "marginLeft", left: "marginRight", bottom: "marginTop", top: "marginBottom" };

    handle.addEventListener( "pointerdown", evt => {

        evt.preventDefault();

        origin      = { x: evt.clientX, y: evt.clientY };
        startSize   = { w: frame.offsetWidth, h: frame.offsetHeight };
        minSize     = { w: parseFloat( getComputedStyle( frame ).minWidth  ) || 240,
                        h: parseFloat( getComputedStyle( frame ).minHeight ) || 80 };
        shiftResize = evt.shiftKey;
        startMargin = shiftResize ? parseFloat( getComputedStyle( frame )[ marginSide[edge] ] ) || 0 : 0;

        handle.setPointerCapture( evt.pointerId );
        frame.classList.add( "dragging" );
    });

    handle.addEventListener( "pointermove", evt => {

        if( !origin ) return;

        const maxSize = {
            w: window.innerWidth  / containerScale - 48,
            h: window.innerHeight / containerScale - 48
        };

        // with shift only the dragged edge moves, otherwise the frame scales from its center
        const factor = shiftResize ? 1 : 2;

        let w = startSize.w;
        let h = startSize.h;

        if( edge === "right"  ) w = startSize.w + factor * ( evt.clientX - origin.x ) / containerScale;
        if( edge === "left"   ) w = startSize.w - factor * ( evt.clientX - origin.x ) / containerScale;
        if( edge === "bottom" ) h = startSize.h + factor * ( evt.clientY - origin.y ) / containerScale;
        if( edge === "top"    ) h = startSize.h - factor * ( evt.clientY - origin.y ) / containerScale;

        w = Math.min( maxSize.w, Math.max( minSize.w, w ) );
        h = Math.min( maxSize.h, Math.max( minSize.h, h ) );

        frame.style.width  = w + "px";
        frame.style.height = h + "px";

        // in shift mode push against the opposite border so only the dragged edge moves
        if( shiftResize ) {

            const dw = w - startSize.w;
            const dh = h - startSize.h;

            frame.style[ marginSide[edge] ] = ( startMargin + ( edge === "left" || edge === "right" ? dw : dh ) ) + "px";
        }
    });

    const stopResizing = () => {

        origin = null;
        frame.classList.remove( "dragging" );
    };

    handle.addEventListener( "pointerup",       stopResizing );
    handle.addEventListener( "pointercancel",   stopResizing );
});


if( typeof window !== "undefined" )
    ( window.RL ||= {} ).panels = { fitContainerToScreen, freezePanelRows };
