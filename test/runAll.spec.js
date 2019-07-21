import makeConsoleMock from 'consolemock'
import execa from 'execa'

import getStagedFiles from '../src/getStagedFiles'
import runAll from '../src/runAll'
import {
  backupOriginalState,
  applyModifications,
  restoreOriginalState,
  dropBackupStashes
} from '../src/gitWorkflow'

jest.mock('../src/getStagedFiles')
jest.mock('../src/gitWorkflow')

getStagedFiles.mockImplementation(async () => [])

const globalConsoleTemp = global.console

describe('runAll', () => {
  beforeAll(() => {
    global.console = makeConsoleMock()
  })

  afterEach(() => {
    global.console.clearHistory()
    backupOriginalState.mockClear()
    applyModifications.mockClear()
    restoreOriginalState.mockClear()
    dropBackupStashes.mockClear()
  })

  afterAll(() => {
    global.console = globalConsoleTemp
  })

  it('should not throw when a valid config is provided', () => {
    expect(() => runAll({})).not.toThrow()
  })

  it('should return a promise', () => {
    expect(runAll({})).toBeInstanceOf(Promise)
  })

  it('should resolve the promise with no tasks', async () => {
    expect.assertions(1)
    const res = await runAll({ config: {} })

    expect(res).toEqual('No tasks to run.')
  })

  it('should resolve the promise with no files', async () => {
    expect.assertions(1)
    await runAll({ config: { '*.js': ['echo "sample"'] } })
    expect(console.printHistory()).toMatchSnapshot()
  })

  it('should use an injected logger', async () => {
    expect.assertions(1)
    const logger = makeConsoleMock()
    await runAll({ config: { '*.js': ['echo "sample"'] }, debug: true }, logger)
    expect(logger.printHistory()).toMatchSnapshot()
  })

  it('should not skip tasks if there are files', async () => {
    expect.assertions(1)
    getStagedFiles.mockImplementationOnce(async () => ['sample.js'])
    await runAll({ config: { '*.js': ['echo "sample"'] } })
    expect(console.printHistory()).toMatchSnapshot()
  })

  it('should skip applying modifications if there are errors during linting', async () => {
    expect.assertions(5)
    getStagedFiles.mockImplementationOnce(async () => ['sample.js'])
    execa.mockImplementation(() =>
      Promise.resolve({
        stdout: '',
        stderr: 'Linter finished with error',
        code: 1,
        failed: true,
        cmd: 'mock cmd'
      })
    )

    try {
      await runAll({ config: { '*.js': ['echo "sample"'] } })
    } catch (err) {
      console.log(err)
    }
    expect(console.printHistory()).toMatchSnapshot()
    expect(backupOriginalState).toHaveBeenCalledTimes(1)
    expect(applyModifications).toHaveBeenCalledTimes(0)
    expect(restoreOriginalState).toHaveBeenCalledTimes(1)
    expect(dropBackupStashes).toHaveBeenCalledTimes(1)
  })

  it('should warn if the argument length is longer than what the platform can handle', async () => {
    getStagedFiles.mockImplementationOnce(async () => new Array(100000).fill('sample.js'))

    try {
      await runAll({ config: { '*.js': () => 'echo "sample"' } })
    } catch (err) {
      console.log(err)
    }
    expect(console.printHistory()).toMatchSnapshot()
  })

  it('should skip linters and stash update but perform working copy restore if terminated', async () => {
    expect.assertions(5)
    getStagedFiles.mockImplementationOnce(async () => ['sample.js'])
    execa.mockImplementation(() =>
      Promise.resolve({
        stdout: '',
        stderr: '',
        code: 0,
        failed: false,
        killed: true,
        signal: 'SIGINT',
        cmd: 'mock cmd'
      })
    )

    try {
      await runAll({ config: { '*.js': ['echo "sample"'] } })
    } catch (err) {
      console.log(err)
    }
    expect(console.printHistory()).toMatchSnapshot()
    expect(backupOriginalState).toHaveBeenCalledTimes(1)
    expect(applyModifications).toHaveBeenCalledTimes(0)
    expect(restoreOriginalState).toHaveBeenCalledTimes(1)
    expect(dropBackupStashes).toHaveBeenCalledTimes(1)
  })

  it('should reject promise when error during getStagedFiles', async () => {
    expect.assertions(1)
    getStagedFiles.mockImplementationOnce(async () => null)
    await expect(runAll({})).rejects.toThrowErrorMatchingSnapshot()
  })

  it('should skip stashing changes if no lint-staged files are changed', async () => {
    expect.assertions(5)
    getStagedFiles.mockImplementationOnce(async () => ['sample.java'])
    execa.mockImplementationOnce(() =>
      Promise.resolve({
        stdout: '',
        stderr: 'Linter finished with error',
        code: 1,
        failed: true,
        cmd: 'mock cmd'
      })
    )

    try {
      await runAll({ config: { '*.js': ['echo "sample"'] } })
    } catch (err) {
      console.log(err)
    }
    expect(console.printHistory()).toMatchSnapshot()
    expect(backupOriginalState).toHaveBeenCalledTimes(0)
    expect(applyModifications).toHaveBeenCalledTimes(0)
    expect(restoreOriginalState).toHaveBeenCalledTimes(0)
    expect(dropBackupStashes).toHaveBeenCalledTimes(0)
  })
})
