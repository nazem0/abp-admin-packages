using Microsoft.AspNetCore.Mvc;
using Volo.Abp.AspNetCore.Mvc;

namespace AbpAdmin.Host.Controllers;

public class HomeController : AbpController
{
    // The Angular demo when it is deployed alongside (wwwroot/app), Swagger otherwise.
    public ActionResult Index([FromServices] IWebHostEnvironment env)
    {
        return Redirect(env.WebRootFileProvider.GetFileInfo("app/index.html").Exists ? "~/app/" : "~/swagger");
    }
}
