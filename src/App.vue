<template>
  <v-app id="app">
    <h1>Piping Draw</h1>
    <p>
      🎨 End-to-End Encryption Share Drawing via <a href="https://github.com/nwtgck/piping-server">Piping Server</a>&nbsp;
      <br>
      <a href="https://github.com/nwtgck/piping-draw-web">
        <v-icon>fab fa-github</v-icon> GitHub
      </a>
    </p>

    <PipingDraw />
  </v-app>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import PipingDraw from './components/PipingDraw.vue';

@Component({
  components: {
    PipingDraw,
  },
})
export default class App extends Vue {}
</script>

<style>
#app {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}

h1 {
  margin-top: 1em;
}
</style>
