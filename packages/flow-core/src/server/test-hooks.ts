/** Test-Hook: wirft an genau einem Write-Label, um Transaktions-Rollback zu prüfen. */
export function createFailureInjector(failAfter: string | undefined): (label: string) => void {
  return (label) => {
    if (failAfter && label === failAfter) {
      throw new Error(`TEST_FAILURE:${label}`);
    }
  };
}
