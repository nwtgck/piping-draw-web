<template>
  <div>
    <v-layout>
      <v-flex xs12 sm8 offset-sm2 offset-md3 md6>
        <v-card style="padding: 1em; margin: 1em;">
          <v-form v-model="isValidForm">
            <v-text-field label="Server URL"
                          v-model="serverUrl"
                          v-bind:rules="[(v) => !!v || 'Server URL is required']" />
            <v-text-field label="Your ID"
                          v-model="connectId"
                          v-bind:rules="[(v) => !!v || 'Your ID is required']" />
            <v-text-field label="Peer ID"
                          v-model="peerConnectId"
                          placeholder="e.g. bma"
                          v-bind:rules="[(v) => !!v || 'Peer ID is required']" />
            <v-btn v-on:click="connect()"
                   color="primary"
                   block
                   v-bind:disabled="!isValidForm">
              Connect
            </v-btn>
          </v-form>
        </v-card>
      </v-flex>
    </v-layout>

    <v-layout>
      <v-flex xs12 sm8 offset-sm2 offset-md3 md6>
        <v-btn v-on:click="drawingMode = 'pen'"
               icon
               v-bind:color="drawingMode === 'pen' ? '#ccc' : ''">
          <v-icon color="#555">fas fa-paint-brush</v-icon>
        </v-btn>
        <v-btn v-on:click="drawingMode = 'eraser'"
               icon
               v-bind:color="drawingMode === 'eraser' ? '#ccc' : ''">
          <v-icon color="#555">fas fa-eraser</v-icon>
        </v-btn>

        <!-- Color selections -->
        <v-btn v-for="(color, index) in colors"
               :key="index"
               v-on:click="penColor = color"
               icon
               v-bind:color="penColor === color ? '#ccc' : ''">
          <v-icon v-bind:color="color">
            fas fa-circle
          </v-icon>
        </v-btn>
      </v-flex>
    </v-layout>

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
import {getBodyBytesFromResponse} from '@/utils';

const strokeDrawActionFormat = obj({
  kind: literal('stroke' as const),
  color: str,
  startX: num,
  startY: num,
  endX: num,
  endY: num,
});
type StrokeDrawAction = TsType<typeof strokeDrawActionFormat>;

const eraseDrawActionFormat = obj({
  kind: literal('erase' as const),
  startX: num,
  startY: num,
  endX: num,
  endY: num,
});
type EraseDrawAction = TsType<typeof eraseDrawActionFormat>;

const drawActionFormat = union(strokeDrawActionFormat, eraseDrawActionFormat);
type DrawAction = TsType<typeof drawActionFormat>;

function drawActionHandler(context: CanvasRenderingContext2D, drawAction: DrawAction) {
  switch (drawAction.kind) {
    case 'stroke':
      {
        const {
          color,
          startX,
          startY,
          endX,
          endY,
        } = drawAction;
        context.strokeStyle = color;
        // (from: https://stackoverflow.com/a/25916334/2885946)
        context.globalCompositeOperation = 'source-over';
        // TODO: Hard code
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(startX, startY);
        context.lineTo(endX, endY);
        context.stroke();
      }
      break;
    case 'erase':
      {
        const {
          startX,
          startY,
          endX,
          endY,
        } = drawAction;
        // (from: https://stackoverflow.com/a/25916334/2885946)
        context.globalCompositeOperation = 'destination-out';
        // TODO: Hard code
        context.lineWidth = 20;
        context.beginPath();
        context.moveTo(startX, startY);
        context.lineTo(endX, endY);
        context.stroke();
      }
      break;
    default:
      console.log(`Unexpected action: ${JSON.stringify(drawAction)}`);
  }
}

const rsaOtherPrimesInfoFormat = obj({
  d: opt(str),
  r: opt(str),
  t: opt(str),
});

const jsonWebKeyFormat = obj({
  alg: opt(str),
  crv: opt(str),
  d: opt(str),
  dp: opt(str),
  dq: opt(str),
  e: opt(str),
  ext: opt(bool),
  k: opt(str),
  key_ops: opt(arr(str)),
  kty: opt(str),
  n: opt(str),
  oth: opt(arr(rsaOtherPrimesInfoFormat)),
  p: opt(str),
  q: opt(str),
  qi: opt(str),
  use: opt(str),
  x: opt(str),
  y: opt(str),
});

const keyExchangeParcelFormat = obj({
  kind: literal('key_exchange' as const),
  content: obj({
    // Public key of ECDH
    ecdhPublicJwk: jsonWebKeyFormat,
  }),
});

type KeyExchangeParcel = TsType<typeof keyExchangeParcelFormat>;


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
  // Initialization vector size
  private readonly aesGcmIvLength: number = 12;
  private isValidForm: boolean = false;

  // TODO: Hard code
  private serverUrl: string = 'https://ppng.ml';
  private connectId: string = getRandomId(3);
  private peerConnectId: string = '';
  private canvasContext?: CanvasRenderingContext2D;

  private ecdhKeyPairPromise: PromiseLike<CryptoKeyPair> = window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256'},
    false,
    ['deriveKey', 'deriveBits'],
  );

  private commonKey?: CryptoKey;

  private drawingMode: 'pen' | 'eraser' = 'pen';

  private colors: ReadonlyArray<string> = [
    '#326bcd',
    '#ff3300',
    '#ff6600',
    '#ff6699',
    '#9966ff',
    '#00cc66',
    '#f4f414',
    '#464646',
  ];

  private penColor: string = this.colors[0];

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
    context.lineJoin = 'round';

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
      const drawAction: DrawAction = (() => {
        switch (this.drawingMode) {
          case 'pen':
            const stroke: StrokeDrawAction = {
              kind: 'stroke',
              color: this.penColor,
              startX,
              startY,
              endX,
              endY,
            };
            return stroke;
          case 'eraser':
            const erase: EraseDrawAction = {
              kind: 'erase',
              startX,
              startY,
              endX,
              endY,
            };
            return erase;
        }
      })();

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
        if (this.commonKey === undefined) {
          console.error('encrypt key is not defined');
          return;
        }
        // Get JSON of draw action
        const drawActionsJson: string = JSON.stringify(sendDrawActions);
        // Clear the actions
        // (from: https://qiita.com/tohashi/items/058edeaffd716c7234db)
        sendDrawActions.splice(0, sendDrawActions.length);
        // Create a IV
        const iv = crypto.getRandomValues(new Uint8Array(this.aesGcmIvLength));
        // Encrypt
        const encrypted = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv, tagLength: 128 },
          this.commonKey,
          new TextEncoder().encode(drawActionsJson),
        );
        // Send encrypted actions
        await fetch(url, {
          method: 'POST',
          body: new Blob([iv, encrypted]),
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

  /**
   * Exchange key by ECDH
   */
  private async keyExchange(): Promise<CryptoKey | undefined> {
    // Get public JWK of ECDH as JSON
    const ecdhPublicJwk: JsonWebKey = await crypto.subtle.exportKey(
      'jwk',
      (await this.ecdhKeyPairPromise).publicKey,
    );
    const keyExchangeParcel: KeyExchangeParcel = {
      kind: 'key_exchange',
      content: {
        ecdhPublicJwk,
      },
    };
    // Send the public key
    // NOTE: sequence number 0 is used for key-exchange.
    // NOTE: Don't use `await`
    fetch(`${this.serverUrl}/${getPath(this.connectId, this.peerConnectId, 0)}`, {
      method: 'POST',
      body: JSON.stringify(keyExchangeParcel),
    });
    // Get peer's public ECDH key
    const res = await fetch(`${this.serverUrl}/${getPath(this.peerConnectId, this.connectId, 0)}`);
    // Parse the response as key exchange parcel
    const peerKeyExchangeParcel: KeyExchangeParcel | undefined = validatingParse(
      keyExchangeParcelFormat,
      await res.text(),
    );
    if (peerKeyExchangeParcel === undefined) {
      console.error('Parse error in peerKeyExchangeParcel');
      return undefined;
    }
    // Get peer's public key for encryption
    const peerCommonPublicKey: CryptoKey = await crypto.subtle.importKey(
      'jwk',
      peerKeyExchangeParcel.content.ecdhPublicJwk,
      {name: 'ECDH', namedCurve: 'P-256'},
      false,
      [],
    );
    // Generate common key by peer's public key
    const commonKey: CryptoKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: peerCommonPublicKey },
      (await this.ecdhKeyPairPromise).privateKey,
      {name: 'AES-GCM', length: 128},
      true,
      ['encrypt', 'decrypt'],
    );

    return commonKey;
  }

  private async connect() {
    console.log('connect called');

    // Key exchange
    this.commonKey = await this.keyExchange();

    // Set initial pen color by comparing ID
    this.penColor = this.colors[this.connectId < this.peerConnectId ? 0 : 1];

    const recieveSeqCtx = new PromiseSequentialContext();

    for (let seqNum = 1; ;) {
      const url = `${this.serverUrl}/${getPath(this.peerConnectId, this.connectId, seqNum)}`;
      await recieveSeqCtx.run(async () => {
        if (this.canvasContext === undefined) {
          console.error('Canvas context is not defined');
          return;
        }
        if (this.commonKey === undefined) {
          console.error('commonKey key is not defined');
          return;
        }
        try {
          const res = await fetch(url);
          // Get body
          const body: Uint8Array = await getBodyBytesFromResponse(res);
          // Split body into IV and encrypted draw actions
          const iv = body.slice(0, this.aesGcmIvLength);
          const encrypted = body.slice(this.aesGcmIvLength);
          // Decrypt
          const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv, tagLength: 128 },
            this.commonKey,
            encrypted,
          );
          // Parse the response as draw actions
          const drawActions: DrawAction[] | undefined = validatingParse(
            arr(drawActionFormat),
            new TextDecoder().decode(decrypted),
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
