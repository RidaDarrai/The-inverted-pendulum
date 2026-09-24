document.querySelectorAll( ".control-frame" ).forEach( frame => {

    let dragOrigin = null;
    const offset = { x: 0, y: 0 };

    frame.addEventListener( "pointerdown", evt => {

        if( evt.target.closest( "input, button, a" ) ) return;

        dragOrigin = { x: evt.clientX - offset.x, y: evt.clientY - offset.y };
        frame.setPointerCapture( evt.pointerId );
        frame.classList.add( "dragging" );
    });

    frame.addEventListener( "pointermove", evt => {

        if( !dragOrigin ) return;

        offset.x = evt.clientX - dragOrigin.x;
        offset.y = evt.clientY - dragOrigin.y;
        frame.style.transform = `translate( ${offset.x}px, ${offset.y}px )`;
    });

    const stopDragging = () => {

        dragOrigin = null;
        frame.classList.remove( "dragging" );
    };

    frame.addEventListener( "pointerup",       stopDragging );
    frame.addEventListener( "pointercancel",   stopDragging );
});
