<script>
  export let foodTop;
  export let foodLeft;
</script>

<style>
  .food {
    width: 48px;
    height: 48px;
    position: absolute;
    border: solid black 1px;
    background-color: red;
    border-radius: 50%;
    z-index: 0;
  }
</style>

<div class="food" style="left: {foodLeft}px; top: {foodTop}px" />
