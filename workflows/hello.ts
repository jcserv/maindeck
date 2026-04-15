export async function helloWorkflow() {
  "use workflow";
  return { message: "hello from the workflow runtime" };
}
