import { createHash } from "node:crypto";

export const canonicalOrigin = "https://runa.bridgebuildersai.com";
export const relyingPartyId = "runa.bridgebuildersai.com";
export const browserIssuer = `${canonicalOrigin}/auth/realms/runaai-next`;
export const backchannelIssuer = "http://127.0.0.1:9762/realms/runaai-next";
export const callbackUri = `${canonicalOrigin}/session/callback`;
export const privateAddress = "192.168.50.169";
export const caddyBinarySha256 = "5cb9ab71e5756ce72840b8234177a2f40c8b4ab47a806b8e841e2b784e9df62b";
export const keycloakBinarySha256 = "9935b42ac9f187583da27f484f3027fa0784825e42b11f26cb8753e20a701f09";

export const keycloakArguments = Object.freeze([
  "start", "--cache=local", "--http-enabled=true", "--http-host=127.0.0.1", "--http-port=9762",
  "--http-management-host=127.0.0.1", "--http-management-port=9766",
  `--hostname=${canonicalOrigin}/auth`, "--hostname-strict=true", "--proxy-headers=xforwarded",
  "--health-enabled=true", "--metrics-enabled=false",
]);

export const caddyfile = `https://${privateAddress}:9761 {
  bind ${privateAddress}
  tls internal
  request_body {
    max_size 256KB
  }
  reverse_proxy 127.0.0.1:9760 {
    lb_retries 0
    transport http {
      dial_timeout 10s
      response_header_timeout 30s
    }
  }
}
${canonicalOrigin} {
  bind ${privateAddress}
  tls C:\\AI\\RunaAI-Next-Candidate\\secrets\\gate7a-tls\\certificate-chain.pem C:\\AI\\RunaAI-Next-Candidate\\secrets\\gate7a-tls\\private-key.pem
  request_body {
    max_size 256KB
  }
  handle_path /auth/* {
    reverse_proxy 127.0.0.1:9762 {
      lb_retries 0
      transport http {
        dial_timeout 10s
        response_header_timeout 30s
      }
    }
  }
  handle {
    reverse_proxy 127.0.0.1:9760 {
      lb_retries 0
      transport http {
        dial_timeout 10s
        response_header_timeout 30s
      }
    }
  }
}
http://127.0.0.1:9770 {
  bind 127.0.0.1
  reverse_proxy http://192.168.50.165:1234 {
    lb_retries 0
    transport http {
      dial_timeout 10s
      response_header_timeout 30s
    }
  }
}
`;

const sha256 = value => createHash("sha256").update(value).digest("hex");

export function createLanReleaseConfig(predecessor) {
  const current = structuredClone(predecessor.config);
  return Object.freeze({
    ...current,
    publicBaseUrl: canonicalOrigin,
    releaseManifestPath: "gate7a-release.json",
    keycloak: {
      ...current.keycloak,
      issuer: browserIssuer,
      backchannelIssuer,
    },
    gate7a: {
      enabled: true,
      canonicalOrigin,
      relyingPartyId,
      predecessorManifestDigest: predecessor.predecessor.manifestDigest,
    },
    services: {
      ...current.services,
      caddy: { ...current.services.caddy,
        configurationDigest: sha256(caddyfile + caddyBinarySha256) },
      keycloak: { ...current.services.keycloak,
        configurationDigest: sha256(keycloakArguments.join("\0") + keycloakBinarySha256) },
    },
  });
}

export function projectionStatus(predecessor, config) {
  return Object.freeze({
    schemaVersion: "runa2-gate7a-lan-projection/v1",
    canonicalOrigin,
    relyingPartyId,
    browserIssuer,
    backchannelIssuer,
    callbackUri,
    predecessorManifestDigest: predecessor.predecessor.manifestDigest,
    caddyConfigurationDigest: config.services.caddy.configurationDigest,
    keycloakConfigurationDigest: config.services.keycloak.configurationDigest,
    dnsChanged: false,
    listenerChanged: false,
    identityChanged: false,
    productionChanged: false,
    privateValuesIncluded: false,
  });
}
