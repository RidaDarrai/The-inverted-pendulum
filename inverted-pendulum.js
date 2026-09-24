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

fitContainerToScreen();
window.addEventListener( "resize", fitContainerToScreen );
document.fonts?.ready.then( fitContainerToScreen );


document.querySelectorAll( ".control-frame" ).forEach( frame => {

    const offset  = { x: 0, y: 0 };
    let dragOrigin = null;

    frame.addEventListener( "pointerdown", evt => {

        if( evt.target.closest( "input, button, a, .resize-handle" ) ) return;

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


    const handle = frame.querySelector( ".resize-handle" );

    let resizeOrigin = null;
    let startSize    = null;
    let minSize      = null;

    handle.addEventListener( "pointerdown", evt => {

        evt.preventDefault();

        resizeOrigin = { x: evt.clientX, y: evt.clientY };
        startSize    = { w: frame.offsetWidth, h: frame.offsetHeight };
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

        const w = Math.min( maxSize.w, Math.max( minSize.w, startSize.w + ( evt.clientX - resizeOrigin.x ) / containerScale ) );
        const h = Math.min( maxSize.h, Math.max( minSize.h, startSize.h + ( evt.clientY - resizeOrigin.y ) / containerScale ) );

        frame.style.width  = w + "px";
        frame.style.height = h + "px";
    });

    const stopResizing = () => {

        resizeOrigin = null;
        frame.classList.remove( "dragging" );
    };

    handle.addEventListener( "pointerup",       stopResizing );
    handle.addEventListener( "pointercancel",   stopResizing );
});
