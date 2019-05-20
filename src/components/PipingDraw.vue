<template>
  <div>
    Server URL: <input type="text" v-model="serverUrl"><br>
    Your ID: <input type="text" v-model="connectId"><br>
    Peer ID: <input type="text" v-model="peerConnectId"><br>
    <button v-on:click="connect()">Connect</button><br>
    <canvas ref="canvas" width='700' height='500'>
      Canvas is not supported on this browser.
    </canvas>
  </div>
</template>

<script lang="ts">
/* tslint:disable:no-console */
/* tslint:disable:interface-over-type-literal */
import { Component, Prop, Vue } from 'vue-property-decorator';

type StrokeDrawAction = {
  kind: 'stroke',
  startX: number,
  startY: number,
  endX: number,
  endY: number,
};

type DrawAction = StrokeDrawAction;

function drawActionHandler(context: CanvasRenderingContext2D, drawAction: DrawAction) {
  switch (drawAction.kind) {
    case 'stroke':
      const {
        startX,
        startY,
        endX,
        endY,
      } = drawAction;
      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
      context.stroke();
      break;
    default:
      console.log(`Unexpected action: ${JSON.stringify(drawAction)}`);
  }
}

function getPath(toId: string, fromId: string, seqNum: number): string {
  // TODO: Use SHA256 for security
  return `${toId}-to-${fromId}/${seqNum}`;
}

/**
 * Get random ID
 * @param len
 */
function getRandomId(len: number): string {
  // NOTE: some similar shaped alphabets are not used
  const alphas  = [
    'a', 'b', 'c', 'd', 'e', 'f', 'h', 'i', 'j', 'k', 'm', 'n', 'p', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  ];
  const chars   = [...alphas];
  const randomArr = window.crypto.getRandomValues(new Uint32Array(len));
  return Array.from(randomArr).map((n) => chars[n % chars.length]).join('');
}

@Component
export default class PipingDraw extends Vue {
  // TODO: Hard code
  private serverUrl: string = 'http://localhost:8080';
  private connectId: string = getRandomId(3);
  private peerConnectId: string = '';
  private canvasContext?: CanvasRenderingContext2D;


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

    this.canvasContext = context;
    const radius = 5;
    context.strokeStyle = '#326bcd';
    context.lineJoin = 'round';
    context.lineWidth = radius;

    let seqNum: number = 1;
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
      const endX = getX(e as MouseEvent);
      const endY = getY(e as MouseEvent);

      // Create a draw action
      const drawAction: StrokeDrawAction = {
        kind: 'stroke',
        startX,
        startY,
        endX,
        endY,
      };
      // Handle the draw action
      drawActionHandler(context, drawAction);

      // Send the draw action to the peer
      const url = `${this.serverUrl}/${getPath(this.connectId, this.peerConnectId, seqNum)}`;
      fetch(url, {
        method: 'POST',
        body: JSON.stringify(drawAction),
      });
      seqNum++;

      startX = endX;
      startY = endY;
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

  private async connect() {
    if (this.canvasContext === undefined) {
      console.error('Canvas context is not defined');
      return;
    }

    console.log('connect called');
    for (let seqNum = 1; ; seqNum++) {
      const url = `${this.serverUrl}/${getPath(this.peerConnectId, this.connectId, seqNum)}`;
      try {
        const res = await fetch(url);
        // TODO: Don't use any
        const drawAction: any = await res.json();
        // Handle the draw action
        drawActionHandler(this.canvasContext, drawAction);
      } catch {
        seqNum--;
      }
    }
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
