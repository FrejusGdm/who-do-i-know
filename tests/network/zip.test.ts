import assert from "node:assert/strict";
import { test } from "node:test";
import AdmZip from "adm-zip";
import { ArchiveValidationError, boundedZipFiles } from "../../src/lib/zip-safety";

test("a normal CSV archive remains readable", () => {
  const zip = new AdmZip(); zip.addFile("Connections.csv", Buffer.from("First Name,Last Name\nTest,Person\n"));
  const files = boundedZipFiles(zip.toBuffer());
  assert.equal(files.length, 1); assert.equal(files[0].path, "Connections.csv");
  assert.match(files[0].content.toString(), /Test,Person/);
});
test("malformed and oversized advertised ZIP entries fail before allocation", () => {
  assert.throws(() => boundedZipFiles(Buffer.from("invalid zip")), ArchiveValidationError);
  const zip = new AdmZip(); zip.addFile("Connections.csv", Buffer.from("x"));
  const bytes = zip.toBuffer();
  const directoryOffset = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(directoryOffset > 0);
  // Attacker-controlled central directory advertises a 4GB decompressed entry.
  bytes.writeUInt32LE(0xffffffff, directoryOffset + 24);
  assert.throws(() => boundedZipFiles(bytes), ArchiveValidationError);
});
