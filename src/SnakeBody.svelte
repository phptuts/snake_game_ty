<script>
  export let top = 50;
  export let left = 50;
  export let isHead = false;
  export let direction = "right";
</script>

<style>
  .snake-body {
    background-color: green;
    border: black 1px solid;
    position: absolute;
    width: 48px;
    height: 48px;
    z-index: 3;
  }
  .eyes {
    position: absolute;
    background-color: orange;
    border-radius: 50%;
    width: 20%;
    height: 20%;
  }
  #leftEye {
    left: 70%;
    top: 10%;
  }
  #rightEye {
    left: 70%;
    bottom: 10%;
  }
  .snake-body.right {
    transform: rotate(0deg);
  }
  .snake-body.left {
    transform: rotate(180deg);
  }
  .snake-body.up {
    transform: rotate(270deg);
  }
  .snake-body.down {
    transform: rotate(90deg);
  }
</style>

<div style="left: {left}px; top: {top}px;" class="snake-body {direction}">
  {#if isHead}
    <div id="leftEye" class="eyes" />
    <div id="rightEye" class="eyes" />
  {/if}
</div>
