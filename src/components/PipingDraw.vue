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
import {PromiseSequentialContext} from '@/promise-sequential-context';
import {nul, bool, num, str, literal, opt, arr, tuple, obj, union, TsType, validatingParse} from 'ts-json-validator';

const strokeDrawActionFormat = obj({
  kind: literal('stroke' as const),
  startX: num,
  startY: num,
  endX: num,
  endY: num,
});
type StrokeDrawAction = TsType<typeof strokeDrawActionFormat>;

const drawActionFormat = strokeDrawActionFormat;
type DrawAction = TsType<typeof drawActionFormat>;

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
  private serverUrl: string = 'https://ppng.ml';
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

    const sendSeqCtx = new PromiseSequentialContext();
    const sendDrawActions: DrawAction[] = [];

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

      // Enrol the draw action
      sendDrawActions.push(drawAction);

      sendSeqCtx.run(async () => {
        // Skip if actions is empty
        if (sendDrawActions.length === 0) {
          return;
        }

        // Send the draw action to the peer
        const url = `${this.serverUrl}/${getPath(this.connectId, this.peerConnectId, seqNum)}`;
        const body = JSON.stringify(sendDrawActions);
        // Clear the actions
        // (from: https://qiita.com/tohashi/items/058edeaffd716c7234db)
        sendDrawActions.splice(0, sendDrawActions.length);
        await fetch(url, {
          method: 'POST',
          body,
        });
        seqNum++;
      });

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
    console.log('connect called');

    // const receivePromiseLimiter = new PromiseLimiter(3);
    const recieveSeqCtx = new PromiseSequentialContext();

    for (let seqNum = 1; ;) {
      const url = `${this.serverUrl}/${getPath(this.peerConnectId, this.connectId, seqNum)}`;
      await recieveSeqCtx.run(async () => {
        if (this.canvasContext === undefined) {
          console.error('Canvas context is not defined');
          return;
        }
        try {
          const res = await fetch(url);
          // Parse the response as draw actions
          const drawActions: DrawAction[] | undefined = validatingParse(
            arr(drawActionFormat),
            await res.text(),
          );
          if (drawActions === undefined) {
            console.error('Response is not draw action array');
            return;
          }
          // Handle all actions
          for (const drawAction of drawActions) {
            // Handle the draw action
            drawActionHandler(this.canvasContext, drawAction);
          }
          seqNum++;
        } catch (err) {
          console.error(`Error in fetch GET`, err);
        }
      });
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
