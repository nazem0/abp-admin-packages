using Microsoft.Extensions.Options;
using Volo.Abp.AspNetCore.ExceptionHandling;
using Volo.Abp.AuditLogging;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Guids;
using Volo.Abp.Http;
using Volo.Abp.Json;

namespace AbpAdmin.Services.AuditLogs;

/// <summary>
/// ABP stores an audit log's exceptions with the same settings it uses for API responses, so with details hidden
/// from clients the audit log only says "An internal error occurred". Admins need the real cause: store the
/// exception type, message and stack trace. API responses are unchanged (they follow AbpExceptionHandlingOptions).
/// </summary>
[Dependency(ReplaceServices = true)]
[ExposeServices(typeof(IAuditLogInfoToAuditLogConverter))]
public class DetailedAuditLogConverter(
    IGuidGenerator guidGenerator,
    IExceptionToErrorInfoConverter exceptionToErrorInfoConverter,
    IJsonSerializer jsonSerializer,
    IOptions<AbpExceptionHandlingOptions> exceptionHandlingOptions,
    AuditLogEntityTypeFullNameConverter entityTypeFullNameConverter)
    : AuditLogInfoToAuditLogConverter(guidGenerator, exceptionToErrorInfoConverter, jsonSerializer,
        Options.Create(new AbpExceptionHandlingOptions
        {
            SendExceptionsDetailsToClients = true,
            SendStackTraceToClients = true,
            SendExceptionDataToClientTypes = exceptionHandlingOptions.Value.SendExceptionDataToClientTypes,
        }), entityTypeFullNameConverter);
