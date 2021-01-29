import { ReactElement } from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  useGlobalState,
  getCache,
  setCache,
  mutate as globalMutate,
  query as globalQuery,
} from '@react-liblary/use-global-state';

export type CacheType<T = unknown> = {
  data?: T;
  error?: unknown;
};
export type CachesType<T = unknown> = {
  [key: string]: CacheType<T>;
};

export type EventType = 'end';
export const isValidating = () => validating.size !== 0;

const GlobalKey = '@react-liblary/use-fetch';
const validating = new Set<string>();
const validatingEvent = () => {
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
export const mutate = <T = unknown>(key: string, value?: T) => {
  globalMutate<T>([GlobalKey, key], value);
};
export const query = <T = unknown>(key: string) => {
  return globalQuery<T>([GlobalKey, key]);
};

export const createCache = (data?: CachesType) => {
  if (data) {
    setCache(data);
  }
};
export const getDataFromTree = async (element: ReactElement): Promise<CachesType> => {
  return new Promise<CachesType>((resolve) => {
    const appStream = ReactDOMServer.renderToStaticNodeStream(element);
    appStream.read();
    if (!isValidating()) {
      resolve(
        getCache<CacheType>([GlobalKey])
      );
    } else {
      const listener = () => {
        resolve(
          getCache<CacheType>([GlobalKey])
        );
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
            key !== 'error' || typeof value !== 'object'
              ? value
              : Object.fromEntries(
                  Object.entries(Object.getOwnPropertyDescriptors(value)).map(([key, v]) => [
                    key,
                    v.value,
                  ])
                ),
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
  const [data, render] = useGlobalState<CacheType<T> | undefined>(
    [GlobalKey, key],
    options?.initialData === undefined
      ? undefined
      : {
          data: options.initialData,
        }
  );

  options = { ...fetchOptions, ...options } as fetchOption<T>;
  if (!options.skip) {
    if (data?.data === undefined && data?.error === undefined && !validating.has(key)) {
      validating.add(key);
      render({});
      const result = options.fetch ? options.fetch(key) : fetch(key).then((data) => data.json());
      if (!(result instanceof Promise)) {
        validating.delete(key);
        render({ data: result });
        validatingEvent();
      } else {
        result
          .then((data) => {
            validating.delete(key);
            render({ data });
            validatingEvent();
          })
          .catch((error) => {
            validating.delete(key);
            render({ error });
            validatingEvent();
          });
      }
    }
  }
  const dispatch = (data?: T) => {
    if (data === undefined) render({});
    else render({ data });
  };
  return {
    data: data?.data,
    error: data?.error,
    dispatch,
    isValidating: validating.has(key),
  };
}
