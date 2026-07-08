import { legacyShell } from "./legacyShell";

export function App() {
  return <div dangerouslySetInnerHTML={{ __html: legacyShell }} />;
}
