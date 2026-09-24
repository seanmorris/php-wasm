// This fixture is loaded by workerd, not Node. All PHP instances are request-local.
/**
 * Binds the same final PHP artifact to the independent Worker test cases.
 * @param {typeof import('../../source/PhpCloudflare.mjs').PhpCloudflare} PhpCloudflare Version-bound public wrapper constructor.
 * @param {function(object): Promise<object>} factory Generated low-level module factory.
 * @param {WebAssembly.Module} wasm Statically imported compiled module.
 * @returns {object} Worker fetch handler.
 */
export function createWorker(PhpCloudflare, factory, wasm)
{
	return {
		async fetch(request, env) {
			const input = await request.json();
			let phase = 'construct';
			let stdout = '', stderr = '';
			try
			{
				if(input.case === 'engine-policy')
				{
					const rejected = callback => { try
					{ callback(); return false; } catch
					{ return true; } };
					return Response.json({
						eval: rejected(() => eval('40 + 2'))
						, function: rejected(() => new Function('return 42'))
						, wasmBytes: rejected(() => new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0])))
					});
				}
				if(input.case === 'setup')
				{
					phase = 'D1 fixture setup';
					for(const [database, identity] of [[env.DB, 'main'], [env.SECOND_DB, 'second']])
					{
						await database.prepare('CREATE TABLE items (name TEXT, amount REAL, optional TEXT)').run();
						await database.prepare('CREATE TABLE identity (value TEXT)').run();
						await database.prepare('INSERT INTO identity VALUES (?)').bind(identity).run();
					}
					return Response.json({ setup: true });
				}
				if(input.case === 'raw-exports-regression')
				{
					phase = 'raw factory initialization';
					const module = await factory({
						shared: { delay: { then(resolve) { setTimeout(() => resolve(42), 2); } } }
						, print: line => { stdout += line; }
						, printErr: line => { stderr += line; }
						, instantiateWasm(imports, receiveInstance) {
							const instance = new WebAssembly.Instance(wasm, imports);
							receiveInstance(instance, wasm);
							// Deliberately retain the historically failing synchronous hook.
							return instance.exports;
						}
					});
					phase = 'raw Asyncify call';
					await module.ccall('pib_storage_init', 'number', [], [], { async: true });
					await module.ccall('pib_init', 'number', ['string'], ['embed'], { async: true });
					const exit = await module.ccall('pib_run', 'number', ['string'],
						['?><?php echo vrzno_await(vrzno_shared("delay")), "\\n";'], { async: true });
					return Response.json({ exit, stdout, stderr });
				}
				const database = input.database === 'second' ? env.SECOND_DB : env.DB;
				const php = new PhpCloudflare({
					cfd1: input.case === 'd1-missing' ? {} : { mainDb: input.prepareOnly ? { prepare: sql => database.prepare(sql) } : database }
					, shared: {
						requestId: input.id ?? 'fixture'
						, delay: { then(resolve) { setTimeout(() => resolve(42), 2); } }
						, rejection: { then(resolve, reject) { setTimeout(() => reject(new Error('fixture rejection')), 2); } }
						, callback: callback => callback(41)
					}
				});
				php.addEventListener('output', event => { stdout += event.detail.join(''); });
				php.addEventListener('error', event => { stderr += event.detail.join(''); });
				phase = 'initialize';
				const module = await php.binary;
				phase = input.case;
				let code;
				switch(input.case)
				{
					case 'd1-features':
						// PHP supplied only by the local regression harness.
						code = input.code;
						break;
					case 'baseline':
						code = `echo json_encode([PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION, PHP_SAPI,
							extension_loaded('vrzno'), extension_loaded('zip'), extension_loaded('zlib'),
							in_array('cfd1', PDO::getAvailableDrivers(), true)]);`;
						break;
					case 'bridge':
						code = `$callback = vrzno_shared('callback');
							echo json_encode([vrzno_await(vrzno_shared('delay')), $callback(fn($x) => $x + 1), eval('return 40 + 2;')]);`;
						break;
					case 'js-eval':
						code = `try { vrzno_eval('40 + 2'); echo 'UNEXPECTED_EVAL_SUCCESS'; }
							catch (Throwable $error) { echo json_encode(['rejected' => true, 'message' => $error->getMessage()]); }`;
						break;
					case 'queue':
					{
						const results = await Promise.all([
							php.exec(`(function() { $GLOBALS['queueOrder'] = 'A'; vrzno_await(vrzno_shared('delay')); return $GLOBALS['queueOrder'] .= 'B'; })()`)
							, php.exec(`$GLOBALS['queueOrder'] .= 'C'`)
							, php.run(`<?php echo $GLOBALS['queueOrder'] . 'D';`)
						]);
						return Response.json({ results, stdout, stderr });
					}
					case 'recovery':
						code = `try { vrzno_eval('40 + 2'); } catch (Throwable $error) {}
							echo vrzno_await(vrzno_shared('delay'));`;
						break;
					case 'async-recovery':
						code = `$message = 'UNEXPECTED_ASYNC_SUCCESS';
							try { vrzno_await(vrzno_shared('rejection')); }
							catch (Throwable $error) { $message = $error->getMessage(); }
							echo json_encode([$message, vrzno_await(vrzno_shared('delay'))]);`;
						break;
					case 'isolation':
						code = `$before = file_exists('/request.txt');
							file_put_contents('/request.txt', vrzno_shared('requestId'));
							echo json_encode([$before, file_get_contents('/request.txt'), vrzno_shared('requestId')]);`;
						break;
					case 'd1-crud':
						code = `$pdo = new PDO('cfd1:mainDb', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
							$insert = $pdo->prepare('INSERT INTO items (name, amount, optional) VALUES (?, ?, ?)');
							$insert->execute(['alpha', 7, null]); $inserted = $insert->rowCount();
							$insert->execute(['beta', 2.5, 'text']);
							$select = $pdo->prepare('SELECT name, amount, optional FROM items WHERE name = ?');
							$select->execute(['alpha']); $first = $select->fetch(PDO::FETCH_ASSOC);
							$select->execute(['beta']); $second = $select->fetchAll(PDO::FETCH_ASSOC);
							$update = $pdo->prepare('UPDATE items SET amount = ? WHERE name = ?');
							$update->execute([8, 'alpha']); $updated = $update->rowCount();
							$delete = $pdo->prepare('DELETE FROM items WHERE name = ?');
							$delete->execute(['alpha']); $deleted = $delete->rowCount();
							echo json_encode([$inserted, $first, $second, $updated, $deleted]);`;
						break;
					case 'd1-binding':
						code = `$pdo = new PDO('cfd1:mainDb', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
							$query = $pdo->prepare('SELECT value FROM identity'); $query->execute();
							echo json_encode($query->fetch(PDO::FETCH_ASSOC));`;
						break;
					case 'd1-parameters':
						code = `$pdo = new PDO('cfd1:mainDb', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
							$query = $pdo->prepare('SELECT ? AS first, ? AS second, ? AS optional, ? AS flag');
							$value = 7;
							$query->bindValue(2, 'text', PDO::PARAM_STR);
							$query->bindParam(1, $value, PDO::PARAM_INT);
							$query->bindValue(3, null, PDO::PARAM_NULL);
							$query->bindValue(4, true, PDO::PARAM_BOOL);
							$query->execute(); $first = $query->fetch(PDO::FETCH_ASSOC);
							$value = 9; $query->execute();
							echo json_encode([$first, $query->fetch(PDO::FETCH_ASSOC)]);`;
						break;
					case 'd1-recovery':
						code = `$pdo = new PDO('cfd1:mainDb', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_SILENT]);
							$invalid = $pdo->prepare('SELECT value FROM table_that_does_not_exist');
							$sqlOk = $invalid->execute(); $sqlCode = $invalid->errorInfo()[0];
							$valid = $pdo->prepare('SELECT 42 AS value'); $valid->execute();
							$afterSql = $valid->fetch(PDO::FETCH_ASSOC);
							$parameter = $pdo->prepare('SELECT ? AS value');
							$countOk = $parameter->execute([]); $countCode = $parameter->errorInfo()[0];
							$parameter->execute([7]); $afterCount = $parameter->fetch(PDO::FETCH_ASSOC);
							$empty = $pdo->prepare('SELECT value FROM identity WHERE value = ?');
							$empty->execute(['absent']); $before = $empty->fetch(PDO::FETCH_ASSOC);
							$empty->execute(['main']); $after = $empty->fetch(PDO::FETCH_ASSOC);
							echo json_encode([$sqlOk, $sqlCode, $afterSql, $countOk, $countCode, $afterCount, $before, $after]);`;
						break;
					case 'd1-errors':
					case 'd1-missing':
						code = `try {
							$pdo = new PDO('cfd1:mainDb', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
							$query = $pdo->prepare('SELECT value FROM table_that_does_not_exist'); $query->execute();
							echo 'UNEXPECTED_D1_SUCCESS';
							} catch (PDOException $error) { echo json_encode(['rejected' => true, 'message' => $error->getMessage()]); }`;
						break;
					case 'd1-unsupported':
						code = `$pdo = new PDO('cfd1:mainDb', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
							$results = [];
							foreach ([fn() => $pdo->beginTransaction(), fn() => $pdo->lastInsertId('sequence'),
								fn() => $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, true),
								fn() => $pdo->setAttribute(PDO::ATTR_AUTOCOMMIT, false),
								fn() => $pdo->prepare('SELECT @named')] as $operation) {
								try { $operation(); $results[] = false; } catch (PDOException $error) { $results[] = true; }
							} echo json_encode($results);`;
						break;
					case 'zip':
					{
						// Controlled outbound fetch: the harness rejects every other network request.
						const archive = await fetch('https://archive.fixture.invalid/example.zip');
						if(!archive.ok) throw new Error(`Fixture archive HTTP ${archive.status}`);
						await php.writeFile('/fixture.zip', new Uint8Array(await archive.arrayBuffer()));
						code = `$zip = new ZipArchive();
							if ($zip->open('/fixture.zip') !== true) throw new RuntimeException('Cannot open fixture zip');
							$zip->extractTo('/unpacked'); $zip->close();
							$text = file_get_contents('/unpacked/hello.txt');
							ob_start(); require '/unpacked/hello.php'; $phpOutput = ob_get_clean();
							$created = new ZipArchive();
							if ($created->open('/created.zip', ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true
								|| !$created->addFromString('roundtrip.txt', $text) || !$created->close())
								throw new RuntimeException('Cannot create ZIP archive');
							if ($created->open('/created.zip') !== true) throw new RuntimeException('Cannot reopen ZIP archive');
							$roundtrip = $created->getFromName('roundtrip.txt'); $created->close();
							echo json_encode([$text, gzdecode(gzencode($text)), gzuncompress(gzcompress($text)), $phpOutput, $roundtrip]);`;
						break;
					}
					default: return new Response('Unknown fixture', { status: 404 });
				}
				const exit = await php.run(`<?php ${code}`);
				return Response.json({ exit, stdout, stderr, memoryBytes: module.HEAPU8.byteLength });
			}
			catch(error)
			{
				return Response.json({ phase, stdout, stderr, error: String(error), stack: error.stack }, { status: 500 });
			}
		}
	};
}
