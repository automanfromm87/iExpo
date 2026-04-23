import React, { useMemo } from 'react';
import {
  Environment,
  Network,
  RecordSource,
  Store,
  FetchFunction,
} from 'relay-runtime';
import { RelayEnvironmentProvider } from 'react-relay';

let defaultEnvironment: Environment | null = null;

export function createRelayEnvironment(fetchFn: FetchFunction): Environment {
  return new Environment({
    network: Network.create(fetchFn),
    store: new Store(new RecordSource()),
  });
}

export function createGraphQLFetch(endpoint: string, getHeaders?: () => Record<string, string>): FetchFunction {
  return async (operation, variables) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...getHeaders?.(),
    };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: operation.text, variables }),
    });
    return response.json();
  };
}

export function initRelay(endpoint: string, getHeaders?: () => Record<string, string>): Environment {
  defaultEnvironment = createRelayEnvironment(createGraphQLFetch(endpoint, getHeaders));
  return defaultEnvironment;
}

export function getRelayEnvironment(): Environment {
  if (!defaultEnvironment) {
    throw new Error('[iex] Call initRelay(endpoint) before using Relay');
  }
  return defaultEnvironment;
}

interface RelayProviderProps {
  endpoint: string;
  getHeaders?: () => Record<string, string>;
  children: React.ReactNode;
}

export function IexRelayProvider({ endpoint, getHeaders, children }: RelayProviderProps): React.JSX.Element {
  const environment = useMemo(() => {
    return initRelay(endpoint, getHeaders);
  }, [endpoint]);

  return (
    <RelayEnvironmentProvider environment={environment}>
      {children}
    </RelayEnvironmentProvider>
  );
}
