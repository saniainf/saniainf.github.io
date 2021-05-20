{
const screenWidth = window.screen.availWidth;
const screenHeight = window.screen.availHeight;
let c = document.createElement("canvas");
let ctx = c.getContext("2d");
c.width = document.documentElement.clientWidth;
c.height = document.documentElement.clientHeight;
document.body.appendChild(c);
let dots = new Array(Math.floor(screenWidth * screenHeight / 7000));

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
}

function distancePow2(leftX, leftY, rightX, rightY){
    let x = Math.pow(leftX - rightX, 2);
    let y = Math.pow(leftY - rightY, 2);
    return (x + y);
}

class Dot {
    constructor() {
        this.x = getRandomInt(screenWidth);
        this.y = getRandomInt(screenHeight);
        this.dirX = getRandomArbitrary(-1, 1);
        this.dirY = getRandomArbitrary(-1, 1);
    }
}
  
for (let i = 0; i < dots.length; i++) {
    dots[i] = new Dot();
}

document.onmousemove = handleMouseMove;
function handleMouseMove(event) {
    var eventDoc, doc, body;

    event = event || window.event;

    if (event.pageX == null && event.clientX != null) {
        eventDoc = (event.target && event.target.ownerDocument) || document;
        doc = eventDoc.documentElement;
        body = eventDoc.body;

        event.pageX = event.clientX +
          (doc && doc.scrollLeft || body && body.scrollLeft || 0) -
          (doc && doc.clientLeft || body && body.clientLeft || 0);
        event.pageY = event.clientY +
          (doc && doc.scrollTop  || body && body.scrollTop  || 0) -
          (doc && doc.clientTop  || body && body.clientTop  || 0 );
    }

    dots[dots.length - 1].x = event.pageX;
    dots[dots.length - 1].y = event.pageY;
}

window.addEventListener('resize', function(event) {
    c.width = document.documentElement.clientWidth;
    c.height = document.documentElement.clientHeight;
}, true);

let speed = 1;
function loop(){
    let gradient = ctx.createLinearGradient(0, 0, 0, c.height);
    gradient.addColorStop(0, '#a9def2');
    gradient.addColorStop(1, '#f0f0f0');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, c.width, c.height);
    drawDots();
    drawLine();
    requestAnimationFrame(loop);
}

function drawDots(){
    for (let i = 0; i < dots.length - 1; i++) {
        const dot = dots[i];
        
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 2, 0, Math.PI*2, true);
        ctx.fill();
    
        dot.x += dot.dirX * speed;
        dot.y += dot.dirY * speed;

        let halfDiffWidth = (screenWidth - c.width) / 2;
        let halfDiffHeight = (screenHeight - c.height) / 2;

        if (dot.x > c.width + halfDiffWidth) {dot.dirX = -(dot.dirX)};
        if (dot.x < -halfDiffWidth) {dot.dirX = Math.abs(dot.dirX)};
        if (dot.y > c.height + halfDiffHeight) {dot.dirY = -(dot.dirY)};
        if (dot.y < -halfDiffHeight) {dot.dirY = Math.abs(dot.dirY)};
    }
}

function drawLine(){
    let maxDistPow2 = Math.pow(120, 2);
    for (let i = 0; i < dots.length - 1; i++) {
        const dot = dots[i];
        
        for (let a = i + 1; a < dots.length; a++) {
            const testDot = dots[a];
            let distPow2 = distancePow2(dot.x, dot.y, testDot.x, testDot.y);
            if (distPow2 < maxDistPow2) {
                let alpha = 1 - Math.sqrt(distPow2 / maxDistPow2);
                ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.5})`;
                ctx.beginPath();
                ctx.moveTo(dot.x, dot.y);
                ctx.lineTo(testDot.x, testDot.y);
                ctx.stroke();
            }
        }
    }
}

loop();
}