<template>
  <div id="container">
    <h1>EASY CHAT</h1>
    <div id="chat_container" v-for="c in chat" :key="c.id">
      <p>{{ c.content }} : ({{ c.name }}) ({{ c.time }})</p>
    </div>
    <div id="input_container">
      <div class="input">
        <label>NAME:</label>
        <input type="text" v-model="name" />
      </div>
      <div class="input">
        <label>TEXT:</label>
        <textarea cols="30" rows="10" v-model="content"></textarea>
      </div>
      <button @click="submit" :disabled="canSubmit">submit</button>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue';
import { io } from 'socket.io-client';

class ChatData {
  name: string;
  content: string;
  time: string;
  id: number;
  constructor(name: string, content: string) {
    this.name = name;
    this.content = content;
    const d = new Date();
    this.time = `${d.getFullYear()}/${
      d.getMonth() + 1
    }/${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
    this.id = d.getTime();
  }
}

export default Vue.extend({
  data: () => ({
    name: '',
    content: '',
    chat: [new ChatData('', '')],
    socket: io(`ws.chattestserveringcp.ml`),
  }),
  computed: {
    canSubmit: function (): boolean {
      return this.name === '' || this.content === '';
    },
  },
  mounted: function () {
    this.socket.on('init', (d: ChatData[]): void => {
      this.chat = d;
    });
    this.socket.on('update', (d: ChatData): void => {
      this.chat.push(d);
    });
  },
  methods: {
    submit: function (): void {
      const d = new ChatData(this.name, this.content);
      this.socket.emit('submit', d);
      this.chat.push(d);
    },
  },
});
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Roboto&display=swap');
* {
  padding: 5px;
  font-family: 'Roboto', sans-serif;
}
.input {
  display: flex;
  flex-direction: column;
}
p {
  border-bottom: 1px solid black;
}
</style>
