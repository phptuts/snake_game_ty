var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    /* src/SnakeBody.svelte generated by Svelte v3.22.2 */

    function create_if_block(ctx) {
    	let div0;
    	let t;
    	let div1;

    	return {
    		c() {
    			div0 = element("div");
    			t = space();
    			div1 = element("div");
    			attr(div0, "id", "leftEye");
    			attr(div0, "class", "eyes svelte-1iorgmg");
    			attr(div1, "id", "rightEye");
    			attr(div1, "class", "eyes svelte-1iorgmg");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t, anchor);
    			insert(target, div1, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t);
    			if (detaching) detach(div1);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let div;
    	let div_class_value;
    	let if_block = /*isHead*/ ctx[2] && create_if_block();

    	return {
    		c() {
    			div = element("div");
    			if (if_block) if_block.c();
    			set_style(div, "left", /*left*/ ctx[1] + "px");
    			set_style(div, "top", /*top*/ ctx[0] + "px");
    			attr(div, "class", div_class_value = "snake-body " + /*direction*/ ctx[3] + " svelte-1iorgmg");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    		},
    		p(ctx, [dirty]) {
    			if (/*isHead*/ ctx[2]) {
    				if (if_block) ; else {
    					if_block = create_if_block();
    					if_block.c();
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*left*/ 2) {
    				set_style(div, "left", /*left*/ ctx[1] + "px");
    			}

    			if (dirty & /*top*/ 1) {
    				set_style(div, "top", /*top*/ ctx[0] + "px");
    			}

    			if (dirty & /*direction*/ 8 && div_class_value !== (div_class_value = "snake-body " + /*direction*/ ctx[3] + " svelte-1iorgmg")) {
    				attr(div, "class", div_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { top = 50 } = $$props;
    	let { left = 50 } = $$props;
    	let { isHead = false } = $$props;
    	let { direction = "right" } = $$props;

    	$$self.$set = $$props => {
    		if ("top" in $$props) $$invalidate(0, top = $$props.top);
    		if ("left" in $$props) $$invalidate(1, left = $$props.left);
    		if ("isHead" in $$props) $$invalidate(2, isHead = $$props.isHead);
    		if ("direction" in $$props) $$invalidate(3, direction = $$props.direction);
    	};

    	return [top, left, isHead, direction];
    }

    class SnakeBody extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { top: 0, left: 1, isHead: 2, direction: 3 });
    	}
    }

    /* src/Snake.svelte generated by Svelte v3.22.2 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[2] = list[i];
    	child_ctx[4] = i;
    	return child_ctx;
    }

    // (7:0) {#each snakeBodies as snakeBody, i}
    function create_each_block(ctx) {
    	let current;

    	const snakebody = new SnakeBody({
    			props: {
    				isHead: /*i*/ ctx[4] == 0,
    				top: /*snakeBody*/ ctx[2].top,
    				left: /*snakeBody*/ ctx[2].left,
    				direction: /*direction*/ ctx[1]
    			}
    		});

    	return {
    		c() {
    			create_component(snakebody.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(snakebody, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const snakebody_changes = {};
    			if (dirty & /*snakeBodies*/ 1) snakebody_changes.top = /*snakeBody*/ ctx[2].top;
    			if (dirty & /*snakeBodies*/ 1) snakebody_changes.left = /*snakeBody*/ ctx[2].left;
    			if (dirty & /*direction*/ 2) snakebody_changes.direction = /*direction*/ ctx[1];
    			snakebody.$set(snakebody_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(snakebody.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(snakebody.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(snakebody, detaching);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value = /*snakeBodies*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*snakeBodies, direction*/ 3) {
    				each_value = /*snakeBodies*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { snakeBodies = [] } = $$props;
    	let { direction } = $$props;

    	$$self.$set = $$props => {
    		if ("snakeBodies" in $$props) $$invalidate(0, snakeBodies = $$props.snakeBodies);
    		if ("direction" in $$props) $$invalidate(1, direction = $$props.direction);
    	};

    	return [snakeBodies, direction];
    }

    class Snake extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { snakeBodies: 0, direction: 1 });
    	}
    }

    /* src/Food.svelte generated by Svelte v3.22.2 */

    function create_fragment$2(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "class", "food svelte-p1ib6b");
    			set_style(div, "left", /*foodLeft*/ ctx[1] + "px");
    			set_style(div, "top", /*foodTop*/ ctx[0] + "px");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*foodLeft*/ 2) {
    				set_style(div, "left", /*foodLeft*/ ctx[1] + "px");
    			}

    			if (dirty & /*foodTop*/ 1) {
    				set_style(div, "top", /*foodTop*/ ctx[0] + "px");
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { foodTop } = $$props;
    	let { foodLeft } = $$props;

    	$$self.$set = $$props => {
    		if ("foodTop" in $$props) $$invalidate(0, foodTop = $$props.foodTop);
    		if ("foodLeft" in $$props) $$invalidate(1, foodLeft = $$props.foodLeft);
    	};

    	return [foodTop, foodLeft];
    }

    class Food extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { foodTop: 0, foodLeft: 1 });
    	}
    }

    /* src/App.svelte generated by Svelte v3.22.2 */

    function create_fragment$3(ctx) {
    	let h1;
    	let t1;
    	let main;
    	let t2;
    	let t3;
    	let h2;
    	let t4;
    	let t5;
    	let current;
    	let dispose;

    	const snake = new Snake({
    			props: {
    				direction: /*direction*/ ctx[2],
    				snakeBodies: /*snakeBodies*/ ctx[3]
    			}
    		});

    	const food = new Food({
    			props: {
    				foodLeft: /*foodLeft*/ ctx[0],
    				foodTop: /*foodTop*/ ctx[1]
    			}
    		});

    	return {
    		c() {
    			h1 = element("h1");
    			h1.textContent = "Snake Game";
    			t1 = space();
    			main = element("main");
    			create_component(snake.$$.fragment);
    			t2 = space();
    			create_component(food.$$.fragment);
    			t3 = space();
    			h2 = element("h2");
    			t4 = text("Score ");
    			t5 = text(/*score*/ ctx[4]);
    			attr(h1, "class", "svelte-1wfeo8w");
    			attr(main, "class", "svelte-1wfeo8w");
    			attr(h2, "class", "svelte-1wfeo8w");
    		},
    		m(target, anchor, remount) {
    			insert(target, h1, anchor);
    			insert(target, t1, anchor);
    			insert(target, main, anchor);
    			mount_component(snake, main, null);
    			append(main, t2);
    			mount_component(food, main, null);
    			insert(target, t3, anchor);
    			insert(target, h2, anchor);
    			append(h2, t4);
    			append(h2, t5);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(window, "keydown", /*onKeyDown*/ ctx[5]);
    		},
    		p(ctx, [dirty]) {
    			const snake_changes = {};
    			if (dirty & /*direction*/ 4) snake_changes.direction = /*direction*/ ctx[2];
    			if (dirty & /*snakeBodies*/ 8) snake_changes.snakeBodies = /*snakeBodies*/ ctx[3];
    			snake.$set(snake_changes);
    			const food_changes = {};
    			if (dirty & /*foodLeft*/ 1) food_changes.foodLeft = /*foodLeft*/ ctx[0];
    			if (dirty & /*foodTop*/ 2) food_changes.foodTop = /*foodTop*/ ctx[1];
    			food.$set(food_changes);
    			if (!current || dirty & /*score*/ 16) set_data(t5, /*score*/ ctx[4]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(snake.$$.fragment, local);
    			transition_in(food.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(snake.$$.fragment, local);
    			transition_out(food.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h1);
    			if (detaching) detach(t1);
    			if (detaching) detach(main);
    			destroy_component(snake);
    			destroy_component(food);
    			if (detaching) detach(t3);
    			if (detaching) detach(h2);
    			dispose();
    		}
    	};
    }

    function isCollide(a, b) {
    	return !(a.top < b.top || a.top > b.top || a.left < b.left || a.left > b.left);
    }

    function getDirectionFromKeyCode(keyCode) {
    	if (keyCode === 38) {
    		return "up";
    	} else if (keyCode === 39) {
    		return "right";
    	} else if (keyCode === 37) {
    		return "left";
    	} else if (keyCode === 40) {
    		return "down";
    	}

    	return false;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let foodLeft = 0;
    	let foodTop = 0;
    	let direction = "right";
    	let snakeBodies = [];

    	setInterval(
    		() => {
    			snakeBodies.pop();
    			let { left, top } = snakeBodies[0];

    			if (direction === "up") {
    				top -= 50;
    			} else if (direction === "down") {
    				top += 50;
    			} else if (direction === "left") {
    				left -= 50;
    			} else if (direction === "right") {
    				left += 50;
    			}

    			const newHead = { left, top };
    			$$invalidate(3, snakeBodies = [newHead, ...snakeBodies]);

    			if (isCollide(newHead, { left: foodLeft, top: foodTop })) {
    				moveFood();
    				$$invalidate(3, snakeBodies = [...snakeBodies, snakeBodies[snakeBodies.length - 1]]);
    			}

    			if (isGameOver()) {
    				resetGame();
    			}
    		},
    		200
    	);

    	function moveFood() {
    		$$invalidate(1, foodTop = Math.floor(Math.random() * 14) * 50);
    		$$invalidate(0, foodLeft = Math.floor(Math.random() * 20) * 50);
    	}

    	function resetGame() {
    		moveFood();
    		$$invalidate(2, direction = "right");
    		$$invalidate(3, snakeBodies = [{ left: 100, top: 0 }, { left: 50, top: 0 }, { left: 0, top: 0 }]);
    	}

    	function isGameOver() {
    		const snakeBodiesNoHead = snakeBodies.slice(1);
    		const snakeCollisions = snakeBodiesNoHead.filter(sb => isCollide(sb, snakeBodies[0]));

    		if (snakeCollisions.length > 0) {
    			return true;
    		}

    		const { top, left } = snakeBodies[0];

    		if (top >= 700 || top < 0 || left < 0 || left >= 1000) {
    			return true;
    		}

    		return false;
    	}

    	function onKeyDown(e) {
    		const newDirection = getDirectionFromKeyCode(e.keyCode);

    		if (newDirection) {
    			$$invalidate(2, direction = newDirection);
    		}
    	}

    	resetGame();
    	let score;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*snakeBodies*/ 8) {
    			 $$invalidate(4, score = snakeBodies.length - 3);
    		}
    	};

    	return [foodLeft, foodTop, direction, snakeBodies, score, onKeyDown];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});
    	}
    }

    const app = new App({
      target: document.body,
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
