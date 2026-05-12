/**
 * Babel pre-pass for react-native-wishlist that adds a `'worklet';` directive
 * to the callbacks passed to a configurable set of wishlist hooks (e.g.
 * `useTemplateValue`). It also recursively marks nested helpers — including
 * functions hoisted to module top-level by Babel/React Compiler — so the
 * react-native-worklets-core plugin can serialise them.
 *
 * Configure via plugin options:
 *
 *   ['./babel-plugin-wishlist-worklets', { hooks: ['useTemplateValue'] }]
 *
 * The plugin must be listed BEFORE 'react-native-worklets-core/plugin' so the
 * directive is in place when worklets-core walks the tree.
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
    if (!fnPath || !fnPath.node || visited.has(fnPath.node)) return;
    visited.add(fnPath.node);
    if (!ensureWorkletDirectiveOnFunction(fnPath)) return;
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
    if (t.isIdentifier(callee)) return callee.name;
    if (
      (t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee)) &&
      t.isIdentifier(callee.property)
    ) {
      return callee.property.name;
    }
    if (t.isSequenceExpression(callee)) {
      const last = callee.expressions[callee.expressions.length - 1];
      if (t.isIdentifier(last)) return last.name;
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
      Program: {
        enter(programPath, state) {
          const hooks = new Set(
            (state.opts && state.opts.hooks) || DEFAULT_HOOKS,
          );
          programPath.traverse({
            CallExpression(path) {
              const name = matchHookCallee(path.node.callee);
              if (!name || !hooks.has(name)) return;
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
