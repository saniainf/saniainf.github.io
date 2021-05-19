let c = document.createElement("canvas");
let ctx = c.getContext("2d");
c.width = 900;
c.height = 700;
document.body.appendChild(c);
let dots = new Array(50);

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
}

function distance(leftX, leftY, rightX, rightY){
    let x = Math.pow(leftX - rightX, 2);
    let y = Math.pow(leftY - rightY, 2);
    return Math.sqrt(x + y);
}

class Dot {
    constructor() {
        this.x = getRandomInt(c.width);
        this.y = getRandomInt(c.height);
        this.dirX = getRandomArbitrary(-1, 1);
        this.dirY = getRandomArbitrary(-1, 1);
    }
}

for (let i = 0; i < dots.length; i++) {
    dots[i] = new Dot();
}

let speed = 2;
function loop(){
    ctx.fillStyle = "#19f";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
    drawDots();
    drawLine();
    requestAnimationFrame(loop);
}

function drawDots(){
    for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];
        
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 2, 0, Math.PI*2, true);
        ctx.fill();
    
        dot.x += dot.dirX * speed;
        dot.y += dot.dirY * speed;

        if (dot.x > c.width) {dot.dirX = -(dot.dirX)};
        if (dot.x < 0) {dot.dirX = Math.abs(dot.dirX)};
        if (dot.y > c.height) {dot.dirY = -(dot.dirY)};
        if (dot.y < 0) {dot.dirY = Math.abs(dot.dirY)};
    }
}

function drawLine(){
    for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];
        
        for (let a = 0; a < dots.length; a++) {
            const testDot = dots[a];
            if (distance(dot.x, dot.y, testDot.x, testDot.y) < 120) {
                ctx.beginPath();
                ctx.moveTo(dot.x, dot.y);
                ctx.lineTo(testDot.x, testDot.y);
                ctx.stroke();
            }
        }
    }
}

loop();