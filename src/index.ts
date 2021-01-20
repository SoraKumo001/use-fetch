import { Dispatch, ReactElement, SetStateAction, useEffect, useState } from 'react';
import ReactDOMServer from 'react-dom/server';

type Render = Dispatch<SetStateAction<{}>>;
const renderMap = new Map<string, Set<Render>>();

const validating = new Set<string>();
const initialKyes = new Set<string>();

export type CacheType = {
  [key: string]: { [key in 'data' | 'error']?: unknown };
};
export const cache: CacheType = {};

export type EventType = 'end';
export const isValidating = () => validating.size !== 0;
const deleteValidating = (key: string) => {
  validating.delete(key);
  if (validating.size === 0) {
    event.forEach(([name, listener]) => name === 'end' && listener());
  }
};

let event: [string, () => void][] = [];
export const addEvent = (name: EventType, listener: () => void) => {
  event = [...event, [name, listener]];
};
export const removeEvent = (name: EventType, listener: () => void) => {
  event = event.filter((item) => item[0] !== name || item[1] !== listener);
};
export const mutate = async <T>(key?: string, data?: T | Promise<T>) => {
  if (key) {
    if (data !== undefined) cache[key] = { data: await data };
    renderMap.get(key)?.forEach((render) => render({}));
  } else {
    renderMap.forEach((renders) => renders.forEach((render) => render({})));
  }
};

export const createCache = (data?: CacheType) => {
  if (data) {
    Object.entries(data).forEach(([key, value]) => (cache[key] = value));
  }
};
export const getDataFromTree = async (element: ReactElement): Promise<CacheType> => {
  return new Promise<CacheType>((resolve) => {
    const appStream = ReactDOMServer.renderToStaticNodeStream(element);
    appStream.read();
    if (!isValidating()) {
      resolve(cache);
    } else {
      const listener = () => {
        resolve(cache);
        removeEvent('end', listener);
      };
      addEvent('end', listener);
    }
  }).then((cache) =>
    Object.fromEntries(
      Object.entries(cache).map(([key, value]) => [
        key,
        Object.fromEntries(
          Object.entries(value).map(([key, value]) => [
            key,
            key === 'error' ? String(value) : value,
          ])
        ),
      ])
    )
  );
};

export type fetcherFn<Data> = ((key: string) => Data | Promise<Data>) | null;
export type fetchOption<T> = {
  fetch?: fetcherFn<T>;
  initialData?: T;
  skip?: boolean;
};
let fetchOptions: fetchOption<unknown> = {};
export const setOptions = (options: fetchOption<unknown>) => {
  fetchOptions = options;
};
export function useFetch<T>(
  key: string,
  options?: fetchOption<T>
): {
  data?: T;
  dispatch: (data?: T) => void;
  isValidating: boolean;
  error: unknown;
} {
  const [, render] = useState<{} | null>(null);
  const dispatch = (data?: T) => {
    if (data === undefined) delete cache[key];
    else cache[key] = { data };
    render({});
  };
  useEffect(
    () => () => {
      renderMap.get(key)?.delete(render);
    },
    []
  );

  options = { ...fetchOptions, ...options } as fetchOption<T>;
  if (!options.skip) {
    if (options.initialData !== undefined && !initialKyes.has(key)) {
      initialKyes.add(key);
      cache[key] = { ...cache[key], data: options.initialData };
    }
    if (!cache[key] && !validating.has(key)) {
      delete cache[key];
      validating.add(key);
      const result = options.fetch ? options.fetch(key) : fetch(key).then((data) => data.json());
      if (!(result instanceof Promise)) {
        cache[key] = { ...cache[key], data: result };
        deleteValidating(key);
        Array.from(renderMap.get(key) || []).forEach((render) => render({}));
      } else {
        result
          .then((data) => {
            cache[key] = { data };
          })
          .catch((error) => {
            cache[key] = { error };
          })
          .finally(() => {
            deleteValidating(key);
            Array.from(renderMap.get(key) || []).forEach((render) => render({}));
          });
      }
    }
    if (renderMap.has(key)) {
      renderMap.get(key)?.add(render);
    } else {
      const e = new Set<Render>();
      e.add(render);
      renderMap.set(key, e);
    }
  }
  return {
    data: cache[key]?.data as undefined | T,
    dispatch,
    isValidating: validating.has(key),
    error: cache[key]?.error,
  };
}
