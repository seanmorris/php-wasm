// Bun only discovers conventional *.test.* files.  Import the existing Node
// test modules so the JavaScriptCore lane exercises the same runtime behavior
// without renaming or duplicating the canonical tests.
import './basic.mjs';
import './files.mjs';
import './stdlib.mjs';
import './fibers.mjs';
import './cgi-fibers.mjs';
