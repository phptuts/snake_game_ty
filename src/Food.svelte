<script>
  export let foodTop;
  export let foodLeft;
</script>

<style>
  .food {
    width: 50px;
    height: 50px;
    position: absolute;
    border: solid black 1px;
    background-color: red;
    border-radius: 50%;
    z-index: 0;
  }
</style>

<div class="food" style="left: {foodLeft}px; top: {foodTop}px" />
