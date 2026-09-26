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

        if( evt.target.closest( "input, button, a, .resize-handle, #drag-target" ) ) return;

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


// ---------- simulation code ----------

// svg elements that get moved each frame
const sliderElements    = Array.from( document.querySelectorAll( ".slider"     ) );
const topCircleElements = Array.from( document.querySelectorAll( ".top-circle" ) );
const poleElements      = Array.from( document.querySelectorAll( ".pole"       ) );

// true when the pid controller is active
let controllerOn = false;

// pd controller
function controller() {

    // don't even try if the angle is too far off upright
    if( Math.abs(theta) > 0.5 ) return 0;

    return ( ptheta*theta + dtheta*thetadot + px*x + dx*xdot ) * controllerOn;
}

// vector operations
const mul      = (vec , k   ) => vec.map( v => v*k );
const add      = (vec1, vec2) => vec1.map( (_,k) => vec1[k] + vec2[k] );
const dot      = (vec1, vec2) => vec1.reduce( (acc, val, k) => acc + vec1[k] * vec2[k], 0 );
const mod      =  vec         => vec.reduce( (acc,val) => acc + val**2, 0 ) ** 0.5;
const norm     =  vec         => mul( vec, 1/mod(vec) );
const rotm90   =  vec         => [ vec[1], -vec[0] ];
const crossmod = (vec1, vec2) => vec1[0] * vec2[1] - vec1[1] * vec2[0];

function stateDot( state ) {

    // get vars out of state vector
    const [theta, x, thetadot, xdot] = state;

    // equations of motion under gravity and controller
    let xddot     = M / ( m + M*Math.sin(theta)**2 )
                  * ( l * thetadot**2 * Math.sin(theta)
                    - g * Math.sin(theta)*Math.cos(theta) )
                  - f * xdot + controller();

    let thetaddot = g/l * Math.sin(theta)
                  - xddot/l * Math.cos(theta);

    // add dragging forces if there is a dragging pointer
    if( pendulumDraggingPointer ) {

        // direction vector of the pendulum pole
        const poleDir = [ Math.sin(theta), Math.cos(theta) ];

        // displacement vector to pendulum from mouse
        const dist = [ pendulumDraggingPointerPos.x - x - l*Math.sin(theta),
                       pendulumDraggingPointerPos.y     - l*Math.cos(theta) ];

        // create a force on the pendulum
        const springForce  = mul( dist, 600 );
        const thetaddotInc = crossmod( springForce, poleDir ) / ( M * l );
        const xddotInc     = dot( springForce, [1,0] ) / m - thetaddotInc * M*l/m * Math.cos(theta);

        // superpose the accelerations from the spring force onto those from the equations of motion
        // and add damping too
        thetaddot += thetaddotInc - thetadot * 40;
        xddot     += xddotInc     - xdot     * 40;
    }

    // return stateDot vector
    return [thetadot, xdot, thetaddot, xddot];
}


function updateCoordinates() {

    // increment time
    t += dt;

    // avoid division by 0
    if( l == 0 ) return;

    // handle bounce off edge of rail
    const bounce = Math.abs(x) > 0.875 && xdot*x > 0;
    thetadot    += 2*xdot*( Math.cos(theta)**2 ) / ( l*Math.cos(theta) ) * bounce;
    xdot        += -2*xdot * bounce;

    // get state vector
    const state = [theta, x, thetadot, xdot];

    // calculate RK4 intermediate values
    const k1 = stateDot( state );
    const k2 = stateDot( add( state, mul( k1, dt/2 ) ) );
    const k3 = stateDot( add( state, mul( k2, dt/2 ) ) );
    const k4 = stateDot( add( state, mul( k3, dt   ) ) );

    // calculate the overall RK4 step and increment the state vector
    const RK4step = mul( add( add( k1, mul( k2, 2) ), add( mul( k3, 2 ), k4 ) ), 1/6 * dt );

    // update the vars
    [theta, x, thetadot, xdot] = add( state, RK4step );

    // keep theta between -pi and pi
    if( theta >  pi ) theta -= 2*pi;
    if( theta < -pi ) theta += 2*pi;
}


function updateGraphics() {

    // translate all the slider elements by sliderX
    const sliderTranslate = `translateX( ${100*x}px )`;
    sliderElements.forEach( elm => elm.style.transform = sliderTranslate );

    // translate the pole to connect to the slider then rotate it around by theta
    const poleTranslate = sliderTranslate + `rotateZ( ${theta*57.296}deg ) scaleY( ${l/0.65} )`;
    poleElements.forEach( elm => elm.style.transform = poleTranslate );

    // place the circle on top of the pole
    const topCircleTranslate = sliderTranslate + `translateX( ${100*l*Math.sin(theta)}px ) translateY( ${-100*l*Math.cos(theta)}px )`;
    topCircleElements.forEach( elm => elm.style.transform = topCircleTranslate );
}


function mainloop( millis, lastMillis ) {

    dt = ( millis - lastMillis ) / 1000 / stepsPerFrame;

    // do the physics step as many times as needed
    for( let s = 0; s < stepsPerFrame; ++s ) updateCoordinates();

    // update the graphics
    updateGraphics();

    // call this again after 1 frame
    requestAnimationFrame( newMillis => mainloop( newMillis, millis ) );
}

// ---------- end of simulation code ----------


// number of physics steps per frame
const stepsPerFrame = 10;

// simulation constants
const pi = 3.1415926535897932384;
let g  = 9.81;                  // gravitational acceleration
let l  = 0.65;                  // pendulum length
let dt = 0.016 / stepsPerFrame; // time step
let M  = 1;                     // pendulum mass
let m  = 1;                     // slider mass
let f  = 0;                     // slider friction

// pd controller variables
let ptheta = 100;
let dtheta = 10;
let px     = 20;
let dx     = 10;

// simulation vars
let t, x, xdot, xddot, theta, thetadot, thetaddot;

function reset() {

    // set all vars to inital values
    t         = 0;     // time
    x         = 0;     // slider position
    xdot      = 0;     // slider velocity
    xddot     = 0;     // slider acceleration
    theta     = 0.001; // pendulum angle
    thetadot  = 0;     // pendulum angular velocity
    thetaddot = 0;     // pendulum acceleration
}

reset();


// ---------- slider code ----------

class Slider {

    constructor( sliderId, pId = null, inputId = null ) {

        // get the slider and throw an error if it wasn't found
        this.slider = document.getElementById( sliderId );
        if( !this.slider ) throw `Slider instatiated with invalid slider id: "${sliderId}"`;

        // get the p and throw an error if it wasn't found
        this.p = pId ? document.getElementById( pId ) : null;
        if( pId && !this.p ) throw `Slider instatiated with invalid p id: "${pId}"`;

        // get the input and throw an error if it wasn't found
        this.input = inputId ? document.getElementById( inputId ) : null;
        if( inputId && !this.input ) throw `Slider instatiated with invalid input id: "${inputId}"`;

        // this._value is the current value of the slider
        this._value = this.sliderValue;

        // connect the callback to be called when the slider is changed
        this.slider.addEventListener( "input", () => this.sliderChange() );

        // if there's an input connect it to its callback
        this.input?.addEventListener( "input", () => this.inputChange()  );

        // decimal places of the slider
        this.decimalPlaces = this.slider.step.split(".")[1]?.length || 0;

        // method that can be overridden to change number formatting
        this.format = x => x.toString();

        // add an onchange callback that can be set by the user
        this.onchange = () => {};
    }

    get sliderValue() {

        return +this.slider.value;
    }

    set sliderValue( newValue ) {

        this.slider.value = newValue;
    }

    sliderChange() {

        // get the value from the slider
        this._value = this.sliderValue;

        // put the value into the p or input if they were supplied
        if( this.p     ) this.p.innerHTML = this.format( this._value );
        if( this.input ) this.input.value = this.format( this._value );

        this.onchange();
    }

    inputChange() {

        // get the value from the input
        this._value = +this.input.value;

        // put the value into the slider
        this.sliderValue = this._value;

        this.onchange();
    }

    get value() {

        return this._value;
    }

    set value( newValue ) {

        this._value = newValue;

        // put the value into the slider
        this.sliderValue = this._value;

        // put the value into the p or input if they were supplied
        if( this.p )
            this.p.innerHTML = this.format( this._value );

        if( this.input && this.input != document.activeElement )
            this.input.value = this.format( this._value );
    }
}

class LogSlider extends Slider {

    constructor( sliderId, pId = null, numberId = null) {

        super( sliderId, pId, numberId );

        // cache the initial value of the slider
        const initialValue = this.value;

        // make the slider step small as log space is much smaller than actual space
        this.slider.setAttribute( "step", "0.00000001" );

        // map the slider to log space
        this.slider.max = Math.log(this.slider.max);
        this.slider.min = Math.log(this.slider.min);

        // map the initial slider value into log space
        this.slider.value = Math.log( initialValue );

        this.format = x => x.toPrecision(3);
    }

    get sliderValue() {

        return Math.exp( +this.slider.value );
    }

    set sliderValue( newValue ) {

        this.slider.value = Math.log( newValue );
    }
}

// ---------- end of slider code ----------

// setup all the sliders
const pthetaSlider         = new Slider(    "ptheta-slider"         , null, "ptheta-input"          );
const dthetaSlider         = new Slider(    "dtheta-slider"         , null, "dtheta-input"          );
const pxSlider             = new Slider(    "px-slider"             , null, "px-input"              );
const dxSlider             = new Slider(    "dx-slider"             , null, "dx-input"              );
const gravitySlider        = new Slider(    "g-slider"              , null, "g-input"               );
const pendulumLengthSlider = new Slider(    "pendulum-length-slider", null, "pendulum-length-input" );
const pendulumMassSlider   = new LogSlider( "pendulum-mass-slider"  , null, "pendulum-mass-input"   );
const sliderMassSlider     = new LogSlider( "slider-mass-slider"    , null, "slider-mass-input"     );

// link the sliders to change the sim variables
const sliders = [ pthetaSlider, dthetaSlider, pxSlider, dxSlider,
                  gravitySlider, pendulumLengthSlider, pendulumMassSlider, sliderMassSlider ];

sliders.forEach( elm => elm.onchange = () =>
                [ptheta, dtheta, px, dx, g, l, M, m] = sliders.map( elm => elm.value ) );


// ---------- buttons code ----------

function toggleController() {

    controllerOn ^= 1;
    controllerButton.innerHTML = `turn ${controllerOn ? "off" : "on"} controller`;
}

function nudge() {

    // give an impulse to theta
    const randomValue = ( Math.random() - 0.5 ) / 2;
    thetadot += ( randomValue + Math.sign( randomValue ) ) / l ;
}

// get buttons
const resetButton      = document.getElementById("reset");
const controllerButton = document.getElementById("toggle-controller");
const nudgeButton      = document.getElementById("nudge");

// link buttons to callbacks
resetButton.onpointerdown      = reset;
controllerButton.onpointerdown = toggleController;
nudgeButton.onpointerdown      = nudge;

// ---------- end of buttons code ----------


// ---------- pendulum dragging code ----------

// 2 vars used to track the pendulum dragging
let pendulumDraggingPointer    = null;
let pendulumDraggingPointerPos = null;

const background = document.querySelector( "#background" );
const dragTarget = document.querySelector( "#drag-target" );
const railRect   = document.querySelector( "#rail"       );

// add event listeners
dragTarget.addEventListener( "pointerdown" , pointerdownOnPendulum   );
background.addEventListener( "pointermove" , pendulumDragPointermove );
background.addEventListener( "pointerup"   , pointerupOnPendulum     );
background.addEventListener( "pointerleave", pointerupOnPendulum     );

function pointerdownOnPendulum( evt ) {

    // store the pointer ID and position
    pendulumDraggingPointer    = evt.pointerId;
    pendulumDraggingPointerPos = pointerToPendulumSpace( evt );
}

function pointerupOnPendulum( evt ) {

    // only act for the pointer being used
    if( evt.pointerId != pendulumDraggingPointer ) return;

    // unset all the pointer vars as the pointer has been released
    pendulumDraggingPointer    = null;
    pendulumDraggingPointerPos = null;
}

function pendulumDragPointermove( evt ) {

    if( evt.pointerId != pendulumDraggingPointer ) return;

    // update the pendulum dragging pointer pos
    pendulumDraggingPointerPos = pointerToPendulumSpace( evt );
}

function pointerToPendulumSpace( evt ) {

    // find pendulum origin in pendulum space
    const railBBox = railRect.getBoundingClientRect();
    const originX  = railBBox.left + railBBox.width  * 0.5;
    const originY  = railBBox.top  + railBBox.height * 0.5;

    // return the pointer position in pendulum space
    return { x: (evt.clientX - originX) * 0.05 / railBBox.height,
             y: (originY - evt.clientY) * 0.05 / railBBox.height };
}

// ---------- end of pendulum dragging code ----------


mainloop( 0, 0 );
