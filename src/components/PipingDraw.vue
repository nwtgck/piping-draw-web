<template>
  <div>
    <canvas ref="canvas" width='700' height='500'>
      Canvas is not supported on this browser.
    </canvas>
  </div>
</template>

<script lang="ts">
/* tslint:disable:no-console */
import { Component, Prop, Vue } from 'vue-property-decorator';

@Component
export default class PipingDraw extends Vue {
  public mounted() {
    const canvas: HTMLCanvasElement = this.$refs.canvas as HTMLCanvasElement;
    if (!canvas || !canvas.getContext) {
      console.log('canvas is not supported');
    }
    const context: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (context === null) {
      console.error('Canvas context is null');
      return;
    }

    const radius = 5;
    context.strokeStyle = '#326bcd';
    context.lineJoin = 'round';
    context.lineWidth = radius;

    let startX: number;
    let startY: number;
    let isDrawing = false;

    function getX(e: MouseEvent): number {
      return e.pageX - canvas.offsetLeft;
    }

    function getY(e: MouseEvent): number {
      return e.pageY - canvas.offsetTop;
    }

    const startHandler = (e: MouseEvent | HTMLElementEventMap['touchstart']) => {
      isDrawing = true;
      // TODO: Not safe casting (e.originalEvent.touches[0].pageX can be useful)
      startX = getX(e as MouseEvent);
      startY = getY(e as MouseEvent);
    };
    const moveHandler = (e: MouseEvent | HTMLElementEventMap['touchmove']) => {
      if (!isDrawing) { return; }
      // TODO: Not safe casting (e.originalEvent.touches[0].pageX can be useful)
      const x = getX(e as MouseEvent);
      const y = getY(e as MouseEvent);
      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(x, y);
      context.stroke();
      startX = x;
      startY = y;
      e.preventDefault();
    };
    const endHandler = () => {
      isDrawing = false;
    };

    canvas.addEventListener('mousedown', startHandler);
    canvas.addEventListener('touchstart', startHandler);

    canvas.addEventListener('mousemove', moveHandler);
    canvas.addEventListener('touchmove', moveHandler);

    canvas.addEventListener('mouseup', endHandler);
    canvas.addEventListener('touchend', endHandler);
    canvas.addEventListener('mouseleave', endHandler);
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
h3 {
  margin: 40px 0 0;
}
ul {
  list-style-type: none;
  padding: 0;
}
li {
  display: inline-block;
  margin: 0 10px;
}
a {
  color: #42b983;
}
canvas {
  border: 1px solid black;
  cursor: crosshair;
}
</style>
