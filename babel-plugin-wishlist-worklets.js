/**
 * A small Babel pre-pass for react-native-wishlist that auto-workletizes the
 * callbacks passed to a configurable set of wishlist hooks (e.g.
 * `useTemplateValue`). The react-native-worklets 0.8.x plugin only
 * auto-workletizes a hard-coded list of reanimated APIs and no longer exposes
 * the `functionsToWorkletize` option, so we have to ensure the callbacks land
 * at the worklets plugin with a `'worklet';` directive already attached.
 *
 * Configure via plugin options:
 *
 *   ['./babel-plugin-wishlist-worklets', { hooks: ['useTemplateValue'] }]
 *
 * The plugin must be listed BEFORE 'react-native-worklets/plugin' so the
 * directive is in place when worklets walks the tree.
 */
module.exports = function ({ types: t }) {
  const DEFAULT_HOOKS = ['useTemplateValue'];

  const ensureWorkletDirectiveOnFunction = (fnPath) => {
    if (!fnPath) return false;
    if (
      !fnPath.isFunctionExpression() &&
      !fnPath.isArrowFunctionExpression() &&
      !fnPath.isFunctionDeclaration()
    ) {
      return false;
    }
    let body = fnPath.get('body');
    // Concise arrow bodies (`(x) => expr`) need to become block bodies so we
    // can attach a directive.
    if (!body.isBlockStatement()) {
      const expr = body.node;
      const block = t.blockStatement([t.returnStatement(expr)]);
      body.replaceWith(block);
      body = fnPath.get('body');
    }
    const directives = body.node.directives || (body.node.directives = []);
    const alreadyWorklet = directives.some(
      (d) => d.value && d.value.value === 'worklet',
    );
    if (!alreadyWorklet) {
      directives.push(t.directive(t.directiveLiteral('worklet')));
    }
    return true;
  };

  const workletizeFunctionAndCallees = (fnPath, visited) => {
    if (!fnPath || !fnPath.node || visited.has(fnPath.node)) {
      return;
    }
    visited.add(fnPath.node);
    if (!ensureWorkletDirectiveOnFunction(fnPath)) {
      return;
    }
    // Walk the body of this newly-marked worklet and mark every helper it
    // touches as a worklet too — inline function arguments (e.g. the callback
    // passed to `arr.reduce((acc, i) => ...)`) as well as identifier callees
    // that resolve to hoisted top-level definitions (React Compiler / Babel
    // hoisting routinely splits arrow-body helpers out into top-level
    // `function _tempN(...)` declarations). Without this the helpers stay
    // non-worklet on the UI runtime and worklets aborts the call.
    const bodyPath = fnPath.get('body');
    if (!bodyPath || !bodyPath.node) return;
    const handleCalleeIdentifier = (calleePath) => {
      if (!calleePath || !calleePath.isIdentifier()) return;
      const binding = calleePath.scope.getBinding(calleePath.node.name);
      if (!binding) return;
      const bindingPath = binding.path;
      if (bindingPath.isFunctionDeclaration()) {
        workletizeFunctionAndCallees(bindingPath, visited);
      } else if (bindingPath.isVariableDeclarator()) {
        const init = bindingPath.get('init');
        if (init && init.node) {
          workletizeFunctionAndCallees(init, visited);
        }
      }
    };
    bodyPath.traverse({
      CallExpression(callPath) {
        const callee = callPath.get('callee');
        if (callee.isIdentifier()) {
          handleCalleeIdentifier(callee);
        }
        callPath.get('arguments').forEach((arg) => {
          if (
            arg.isFunctionExpression() ||
            arg.isArrowFunctionExpression() ||
            arg.isFunctionDeclaration()
          ) {
            workletizeFunctionAndCallees(arg, visited);
          } else if (arg.isIdentifier()) {
            handleCalleeIdentifier(arg);
          }
        });
      },
    });
  };

  const ensureWorkletDirectiveOnArg = (argPath) => {
    if (!argPath) return;
    const visited = new Set();
    if (
      argPath.isFunctionExpression() ||
      argPath.isArrowFunctionExpression()
    ) {
      workletizeFunctionAndCallees(argPath, visited);
      return;
    }
    if (argPath.isIdentifier()) {
      const binding = argPath.scope.getBinding(argPath.node.name);
      if (binding) {
        const bindingPath = binding.path;
        if (bindingPath.isFunctionDeclaration()) {
          workletizeFunctionAndCallees(bindingPath, visited);
        } else if (bindingPath.isVariableDeclarator()) {
          const init = bindingPath.get('init');
          if (init && init.node) {
            workletizeFunctionAndCallees(init, visited);
          }
        }
      }
    }
  };

  const matchHookCallee = (callee) => {
    if (t.isIdentifier(callee)) {
      return callee.name;
    }
    if (
      (t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee)) &&
      t.isIdentifier(callee.property)
    ) {
      return callee.property.name;
    }
    if (t.isSequenceExpression(callee)) {
      const last = callee.expressions[callee.expressions.length - 1];
      if (t.isIdentifier(last)) {
        return last.name;
      }
      if (
        (t.isMemberExpression(last) || t.isOptionalMemberExpression(last)) &&
        t.isIdentifier(last.property)
      ) {
        return last.property.name;
      }
    }
    return undefined;
  };

  return {
    name: 'wishlist-worklets',
    visitor: {
      // Traverse on Program.enter so we run before React Compiler's hoisting
      // pass (which converts `useTemplateValue(arg => ...)` callbacks into
      // top-level function declarations and would otherwise leave us nothing
      // to mark).
      Program: {
        enter(programPath, state) {
          const hooks = new Set(
            (state.opts && state.opts.hooks) || DEFAULT_HOOKS,
          );
          programPath.traverse({
            CallExpression(path) {
              const name = matchHookCallee(path.node.callee);
              if (!name || !hooks.has(name)) {
                return;
              }
              const args = path.get('arguments');
              if (args.length === 0) return;
              ensureWorkletDirectiveOnArg(args[0]);
            },
          });
        },
      },
    },
  };
};
