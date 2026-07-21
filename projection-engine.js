/* ============================================================
   Life OS deterministic projection and dependency engine.

   Projection definitions declare their event inputs, projection inputs,
   calculation class, version, window, schema, and missing-data behavior.
   The engine caches results, invalidates transitively, prevents cycles, and
   publishes provenance-rich updates without turning derived values into facts.
   ============================================================ */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LifeOSProjectionEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function unique(values) { return values.filter(function (value, index, all) { return all.indexOf(value) === index; }); }
  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + stable(value[key]); }).join(',') + '}';
    return JSON.stringify(value);
  }
  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }

  function validateDefinition(definition) {
    var errors = [];
    ['id', 'displayName', 'outputProjection', 'version', 'truthClass', 'timeWindow', 'recomputeStrategy', 'calculationType', 'outputSchema', 'missingData', 'compute'].forEach(function (field) {
      if (definition[field] == null || definition[field] === '') errors.push(definition.id + ': missing ' + field);
    });
    if (!Array.isArray(definition.eventTypes)) errors.push(definition.id + ': eventTypes must be an array');
    if (!Array.isArray(definition.projectionDeps)) errors.push(definition.id + ': projectionDeps must be an array');
    if (typeof definition.compute !== 'function') errors.push(definition.id + ': compute must be a function');
    if (['deterministic', 'statistical', 'ai-generated'].indexOf(definition.calculationType) < 0) errors.push(definition.id + ': invalid calculationType');
    return errors;
  }

  function createRegistry(initial) {
    var definitions = {};

    function register(definition) {
      var errors = validateDefinition(definition || {});
      if (errors.length) throw new Error(errors.join('; '));
      if (definitions[definition.id]) throw new Error('Duplicate projection: ' + definition.id);
      definitions[definition.id] = Object.freeze(Object.assign({}, definition, {
        eventTypes: Object.freeze((definition.eventTypes || []).slice()),
        projectionDeps: Object.freeze((definition.projectionDeps || []).slice()),
        eventDomains: Object.freeze((definition.eventDomains || []).slice()),
        outputSchema: Object.freeze(clone(definition.outputSchema)),
      }));
      return definitions[definition.id];
    }

    function get(id) { return definitions[id] || null; }
    function list() { return Object.keys(definitions).sort().map(function (id) { return definitions[id]; }); }

    function validate() {
      var errors = [];
      list().forEach(function (definition) {
        errors = errors.concat(validateDefinition(definition));
        definition.projectionDeps.forEach(function (id) { if (!definitions[id]) errors.push(definition.id + ': missing dependency ' + id); });
      });
      var visiting = {};
      var visited = {};
      function walk(id, trail) {
        if (visiting[id]) { errors.push('projection cycle: ' + trail.concat([id]).join(' -> ')); return; }
        if (visited[id] || !definitions[id]) return;
        visiting[id] = true;
        definitions[id].projectionDeps.forEach(function (dep) { walk(dep, trail.concat([id])); });
        delete visiting[id]; visited[id] = true;
      }
      Object.keys(definitions).forEach(function (id) { walk(id, []); });
      return unique(errors);
    }

    function affected(eventTypes, domains, projectionIds) {
      eventTypes = eventTypes || [];
      domains = domains || [];
      var ids = (projectionIds || []).filter(function (id) { return !!definitions[id]; });
      list().forEach(function (definition) {
        if (definition.eventTypes.some(function (type) { return eventTypes.indexOf(type) >= 0; }) ||
            definition.eventDomains.some(function (domain) { return domains.indexOf(domain) >= 0; })) ids.push(definition.id);
      });
      var changed = true;
      while (changed) {
        changed = false;
        list().forEach(function (definition) {
          if (ids.indexOf(definition.id) < 0 && definition.projectionDeps.some(function (dep) { return ids.indexOf(dep) >= 0; })) {
            ids.push(definition.id); changed = true;
          }
        });
      }
      return ids;
    }

    (initial || []).forEach(register);
    return Object.freeze({ register: register, get: get, list: list, validate: validate, affected: affected });
  }

  function validateOutput(schema, value) {
    var errors = [];
    if (schema && schema.type === 'object' && !isObject(value)) errors.push('output must be an object');
    (schema && schema.required || []).forEach(function (field) { if (!value || !Object.prototype.hasOwnProperty.call(value, field)) errors.push('output.' + field + ' is required'); });
    return errors;
  }

  function create(options) {
    options = options || {};
    var repository = options.repository;
    if (!repository || typeof repository.query !== 'function') throw new Error('A canonical repository is required');
    var registry = options.registry || createRegistry(options.definitions || []);
    var registryErrors = registry.validate();
    if (registryErrors.length) throw new Error('Invalid projection registry: ' + registryErrors.join('; '));
    var clock = options.clock || function () { return new Date(); };
    var cache = {};
    var inflight = {};
    var subscribers = [];
    var pendingChange = null;
    var idlePromise = Promise.resolve();

    function cacheKey(id, params) { return id + '|' + stable(params || {}); }
    function paramsDate(params) {
      if (params && /^\d{4}-\d{2}-\d{2}$/.test(params.date || '')) return params.date;
      var now = clock();
      return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    }

    function compute(id, params, evaluation) {
      params = clone(params || {});
      var key = cacheKey(id, params);
      if (cache[key]) return Promise.resolve(clone(cache[key]));
      if (inflight[key]) return inflight[key].then(clone);
      var definition = registry.get(id);
      if (!definition) return Promise.reject(new Error('Unknown projection: ' + id));
      evaluation = evaluation || { stack: [], eventsPromise: null };
      if (evaluation.stack.indexOf(id) >= 0) return Promise.reject(new Error('Projection cycle at runtime: ' + evaluation.stack.concat([id]).join(' -> ')));
      var nextEvaluation = { stack: evaluation.stack.concat([id]), eventsPromise: evaluation.eventsPromise || repository.query({}) };

      inflight[key] = nextEvaluation.eventsPromise.then(function (allEvents) {
        var directEvents = allEvents.filter(function (event) {
          return definition.eventTypes.indexOf(event.type) >= 0 || definition.eventDomains.indexOf(event.domain) >= 0;
        });
        var depPromises = definition.projectionDeps.map(function (depId) { return compute(depId, params, nextEvaluation); });
        return Promise.all(depPromises).then(function (deps) {
          var dependencyMap = {};
          definition.projectionDeps.forEach(function (depId, index) { dependencyMap[depId] = deps[index]; });
          var context = {
            id: id,
            params: params,
            date: paramsDate(params),
            events: directEvents.map(clone),
            allEvents: allEvents.map(clone),
            dependencies: dependencyMap,
            value: function (depId) { return dependencyMap[depId] ? clone(dependencyMap[depId].value) : null; },
            envelope: function (depId) { return dependencyMap[depId] ? clone(dependencyMap[depId]) : null; },
            clock: clock,
          };
          return Promise.resolve(definition.compute(context)).then(function (computed) {
            computed = computed || {};
            var value = ownValue(computed, 'value') ? computed.value : computed;
            var outputErrors = validateOutput(definition.outputSchema, value);
            if (outputErrors.length) throw new Error(id + ' output validation failed: ' + outputErrors.join('; '));
            var depSourceIds = [];
            var depVersions = {};
            deps.forEach(function (dep) {
              depSourceIds = depSourceIds.concat((dep.provenance && dep.provenance.source_event_ids) || []);
              depVersions[dep.id] = dep.version;
            });
            var sourceIds = unique((computed.sourceEventIds || directEvents.map(function (event) { return event.id; })).concat(depSourceIds));
            var coverage = computed.coverage == null ? (sourceIds.length ? 1 : 0) : Math.max(0, Math.min(1, Number(computed.coverage)));
            var envelope = {
              id: id,
              version: definition.version,
              params: params,
              value: clone(value),
              computed_at: clock().toISOString(),
              truth_class: definition.truthClass,
              calculation_type: definition.calculationType,
              confidence: clone(computed.confidence || {
                level: coverage >= 0.8 ? 'high' : coverage >= 0.4 ? 'medium' : 'low',
                score: coverage,
                coverage: coverage,
                sample_size: sourceIds.length,
                calibration_state: definition.calculationType === 'deterministic' ? 'not-applicable' : 'unevaluated',
              }),
              provenance: {
                source_event_ids: sourceIds,
                source_projection_versions: depVersions,
                calculation_id: id,
                calculation_version: definition.version,
                calculation_window: definition.timeWindow,
              },
              explanation: computed.explanation || definition.explanation || definition.displayName + ' is calculated from registered source facts.',
              limitations: clone(computed.limitations || definition.limitations || [definition.missingData]),
              freshness: computed.freshness || null,
            };
            cache[key] = envelope;
            return clone(envelope);
          });
        });
      }).finally(function () { delete inflight[key]; });
      return inflight[key];
    }

    function ownValue(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

    function invalidate(ids) {
      ids = ids || registry.list().map(function (definition) { return definition.id; });
      Object.keys(cache).forEach(function (key) {
        if (ids.some(function (id) { return key.indexOf(id + '|') === 0; })) delete cache[key];
      });
      return ids.slice();
    }

    function notifySubscribers(affectedIds, change) {
      var work = subscribers.map(function (subscription) {
        var ids = subscription.ids.filter(function (id) { return affectedIds.indexOf(id) >= 0; });
        if (!ids.length) return Promise.resolve();
        return Promise.all(ids.map(function (id) { return compute(id, subscription.params); })).then(function (results) {
          try {
            subscription.callback({ ids: ids, projections: results, change: clone(change) });
          } catch (error) {
            try {
              if (root && typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
                root.dispatchEvent(new root.CustomEvent('lifeos:projection-subscriber-error', { detail: { ids: ids, error: String(error && error.message || error) } }));
              }
            } catch (_) {}
          }
        });
      });
      return Promise.all(work);
    }

    function processChange(change) {
      var ids = (change && change.eventIds) || [];
      return Promise.all(ids.map(function (id) { return repository.get(id); })).then(function (events) {
        events = events.filter(Boolean);
        var types = unique(events.map(function (event) { return event.type; }));
        var domains = unique(((change && change.domains) || []).concat(events.map(function (event) { return event.domain; })));
        var affectedIds = registry.affected(types, domains, change && change.projectionIds);
        invalidate(affectedIds);
        return notifySubscribers(affectedIds, change).then(function () {
          try {
            if (root && typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
              root.dispatchEvent(new root.CustomEvent('lifeos:projections-changed', { detail: { ids: affectedIds, eventIds: ids } }));
            }
          } catch (_) {}
          return affectedIds;
        });
      });
    }

    repository.subscribe(function (change) {
      pendingChange = pendingChange ? {
        eventIds: unique((pendingChange.eventIds || []).concat(change.eventIds || [])),
        domains: unique((pendingChange.domains || []).concat(change.domains || [])),
        projectionIds: unique((pendingChange.projectionIds || []).concat(change.projectionIds || [])),
      } : clone(change);
      idlePromise = Promise.resolve().then(function () {
        var current = pendingChange; pendingChange = null;
        return processChange(current);
      });
    });

    function subscribe(ids, callback, subscribeOptions) {
      ids = Array.isArray(ids) ? ids.slice() : [ids];
      ids.forEach(function (id) { if (!registry.get(id)) throw new Error('Unknown projection: ' + id); });
      if (typeof callback !== 'function') throw new Error('Projection subscriber must be a function');
      var subscription = { ids: ids, callback: callback, params: clone(subscribeOptions && subscribeOptions.params || {}) };
      subscribers.push(subscription);
      return function () { subscribers = subscribers.filter(function (candidate) { return candidate !== subscription; }); };
    }

    function explain(id, params) {
      return compute(id, params).then(function (projection) {
        return {
          id: projection.id,
          version: projection.version,
          truth_class: projection.truth_class,
          confidence: clone(projection.confidence),
          source_event_ids: projection.provenance.source_event_ids.slice(),
          source_projection_versions: clone(projection.provenance.source_projection_versions),
          calculation_window: projection.provenance.calculation_window,
          explanation: projection.explanation,
          limitations: clone(projection.limitations),
        };
      });
    }

    var api = Object.freeze({
      get: compute,
      subscribe: subscribe,
      explain: explain,
      invalidate: invalidate,
      registry: registry,
      whenIdle: function () { return idlePromise; },
    });
    return api;
  }

  function install(options) {
    var engine = create(options);
    if (root) {
      root.LifeOS = root.LifeOS || {};
      root.LifeOS.projections = engine;
      root.LifeOS.events = Object.assign({}, root.LifeOS.events || {}, { query: options.repository.query });
    }
    return engine;
  }

  return Object.freeze({ createRegistry: createRegistry, create: create, install: install, stableStringify: stable });
});
