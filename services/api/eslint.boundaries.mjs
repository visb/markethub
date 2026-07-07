/**
 * Regra local de fronteiras de contexto do monolito modular (story 47).
 *
 * Implementa o enforcement automatizado decidido na story: comunicação
 * cross-context SÓ por (a) API pública do contexto alvo — o barrel
 * `src/<módulo>/index.ts` ou um arquivo `*.module.ts` (wiring de DI do Nest) —
 * ou (b) evento de domínio via outbox (stories 45/46). Deep import de internals
 * de outro contexto é erro de lint.
 *
 * Escolha de implementação ("decidir na impl", plano §3): regra local em vez de
 * `eslint-plugin-boundaries`/`import/no-restricted-paths` porque a resolução é
 * path-math pura (imports relativos dentro de `src/`), sem resolver de import —
 * zero dependência nova, allow-list por aresta `arquivo -> alvo` (granularidade
 * que os plugins não dão) e semântica exata: intra-contexto livre, kernel
 * compartilhado (`shared`/`common`/`config`/`prisma`) livre, cross-context pela
 * superfície pública + matriz de dependência entre contextos.
 *
 * Nota: `*.module.ts` importado direto (e não re-exportado no barrel) é
 * deliberado — re-exportar módulos Nest no barrel cria ciclo de require entre
 * barrels (ex.: events.module -> picking barrel -> picking.module -> events
 * barrel) e quebra a avaliação de decorators em runtime.
 */
import path from "node:path";

function toPosix(p) {
  return p.split(path.sep).join("/");
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Fronteiras de bounded context no monolito: cross-context só via barrel público, *.module (DI) ou evento de domínio",
    },
    schema: [
      {
        type: "object",
        properties: {
          srcRoot: { type: "string" },
          contexts: {
            type: "object",
            additionalProperties: { type: "array", items: { type: "string" } },
          },
          sharedContexts: { type: "array", items: { type: "string" } },
          allowedDependencies: {
            type: "object",
            additionalProperties: { type: "array", items: { type: "string" } },
          },
          allow: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unmappedModule:
        'Pasta "{{module}}" não está mapeada em nenhum contexto (eslint.config.mjs → CONTEXTS). Pasta nova em src/ precisa entrar no mapa de contextos.',
      forbiddenContext:
        'Contexto "{{from}}" não pode depender do contexto "{{to}}" ({{spec}}). Use evento de domínio (events/outbox.publisher) para efeito cross-context, ou — se for dependência síncrona legítima — proponha o par na matriz ALLOWED_DEPENDENCIES. Exceção HERDADA exige entrada comentada na allow-list: "{{allowKey}}".',
      deepImport:
        'Deep import cross-context: "{{spec}}" alcança internals do contexto "{{to}}". Importe pela API pública "../{{module}}" (barrel src/{{module}}/index.ts) ou um *.module para DI. Se o símbolo não está no barrel, exporte-o lá conscientemente (vira contrato público do contexto).',
    },
  },

  create(context) {
    const opts = context.options[0] ?? {};
    const srcRoot = path.resolve(context.cwd, opts.srcRoot ?? "src");
    const filename = context.filename;
    const fileRelRaw = path.relative(srcRoot, filename);
    if (fileRelRaw.startsWith("..") || path.isAbsolute(fileRelRaw)) return {};
    const fileRel = toPosix(fileRelRaw).replace(/\.(ts|tsx|js|mjs|cjs)$/, "");

    // Arquivos na raiz de src (app.module, main) são o composition root — podem
    // importar qualquer módulo para montar a aplicação.
    if (!fileRel.includes("/")) return {};
    const fileModule = fileRel.split("/")[0];

    const moduleToContext = new Map();
    for (const [ctx, modules] of Object.entries(opts.contexts ?? {})) {
      for (const mod of modules) moduleToContext.set(mod, ctx);
    }
    const sharedContexts = new Set(opts.sharedContexts ?? []);
    const allowSet = new Set(opts.allow ?? []);
    const fileCtx = moduleToContext.get(fileModule);

    function checkSource(sourceNode) {
      const spec = sourceNode.value;
      if (typeof spec !== "string" || !spec.startsWith(".")) return;
      const resolved = path.resolve(path.dirname(filename), spec);
      let rel = toPosix(path.relative(srcRoot, resolved));
      if (rel.startsWith("..") || path.isAbsolute(rel)) return; // fora de src
      rel = rel.replace(/\.(ts|tsx|js|json)$/, "");

      // Alvo na raiz de src (sem pasta): só o composition root importa isso.
      if (!rel.includes("/") && !moduleToContext.has(rel)) {
        context.report({ node: sourceNode, messageId: "unmappedModule", data: { module: rel } });
        return;
      }
      const targetModule = rel.includes("/") ? rel.split("/")[0] : rel;
      if (targetModule === fileModule) return; // intra-módulo: livre

      if (fileCtx === undefined) {
        context.report({
          node: sourceNode,
          messageId: "unmappedModule",
          data: { module: fileModule },
        });
        return;
      }
      const targetCtx = moduleToContext.get(targetModule);
      if (targetCtx === undefined) {
        context.report({
          node: sourceNode,
          messageId: "unmappedModule",
          data: { module: targetModule },
        });
        return;
      }
      if (targetCtx === fileCtx) return; // intra-contexto: livre
      if (sharedContexts.has(targetCtx)) return; // kernel compartilhado: livre

      const allowKey = `${fileRel} -> ${rel}`;
      if (allowSet.has(allowKey)) return; // exceção herdada documentada

      const allowed = new Set([
        ...(opts.allowedDependencies?.[fileCtx] ?? []),
        ...(opts.allowedDependencies?.["*"] ?? []),
      ]);
      if (!allowed.has(targetCtx) && !allowed.has("*")) {
        context.report({
          node: sourceNode,
          messageId: "forbiddenContext",
          data: { from: fileCtx, to: targetCtx, spec, allowKey },
        });
        return;
      }

      const isBarrel = rel === targetModule || rel === `${targetModule}/index`;
      const isNestModule = rel.split("/").pop().endsWith(".module");
      if (!isBarrel && !isNestModule) {
        context.report({
          node: sourceNode,
          messageId: "deepImport",
          data: { spec, to: targetCtx, module: targetModule },
        });
      }
    }

    return {
      ImportDeclaration(node) {
        checkSource(node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.source) checkSource(node.source);
      },
      ExportAllDeclaration(node) {
        checkSource(node.source);
      },
      ImportExpression(node) {
        if (node.source.type === "Literal") checkSource(node.source);
      },
    };
  },
};

export default {
  rules: { "context-boundaries": rule },
};
