from telethon import TelegramClient, errors
from async_timeout import run_with_timeout, CONNECT_TIMEOUT, API_TIMEOUT, TIMEOUT_SENTINEL
from telethon.tl.functions.account import SetPrivacyRequest
from telethon.tl.types import (
    InputPrivacyKeyStatusTimestamp,
    InputPrivacyKeyProfilePhoto,
    InputPrivacyKeyPhoneNumber,
    InputPrivacyKeyForwards,
    InputPrivacyKeyPhoneCall,
    InputPrivacyKeyChatInvite,
    InputPrivacyValueAllowAll,
    InputPrivacyValueAllowContacts,
    InputPrivacyValueDisallowAll
)
import asyncio
from typing import List, Dict, Any, Tuple, Optional

API_ID = '25170767'
API_HASH = 'd512fd74809a4ca3cd59078eef73afcd'

# Mapping of privacy keys to their Telethon classes
PRIVACY_KEY_MAP = {
    'InputPrivacyKeyStatusTimestamp': InputPrivacyKeyStatusTimestamp,
    'InputPrivacyKeyProfilePhoto': InputPrivacyKeyProfilePhoto,
    'InputPrivacyKeyPhoneNumber': InputPrivacyKeyPhoneNumber,
    'InputPrivacyKeyForwards': InputPrivacyKeyForwards,
    'InputPrivacyKeyPhoneCall': InputPrivacyKeyPhoneCall,
    'InputPrivacyKeyChatInvite': InputPrivacyKeyChatInvite,
}

# Mapping of dropdown values to Telethon privacy value classes
PRIVACY_VALUE_MAP = {
    'Everybody': InputPrivacyValueAllowAll,
    'My Contacts': InputPrivacyValueAllowContacts,
    'Nobody': InputPrivacyValueDisallowAll,
}


async def apply_privacy_settings_for_session(
    session_path: str,
    settings: Dict[str, str]
) -> Dict[str, Any]:
    """
    Apply privacy settings to a single Telegram session.
    Only applies settings that are enabled in the settings dict.
    
    Args:
        session_path: Path to the .session file (without .session extension)
        settings: Dict mapping privacy key names to privacy values ('Everybody', 'My Contacts', 'Nobody')
                 Only keys present in this dict will be applied.
    
    Returns:
        dict: Result with success status and details
    """
    # Remove .session extension if present
    if session_path.endswith('.session'):
        session_path = session_path[:-8]
    
    client = TelegramClient(session_path, API_ID, API_HASH)
    
    try:
        r = await run_with_timeout(client.connect(), CONNECT_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if r is TIMEOUT_SENTINEL:
            return {
                "success": False,
                "error": "Connection timed out",
                "session_path": session_path
            }
        
        # Check if authorized
        is_auth = await run_with_timeout(client.is_user_authorized(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if is_auth is TIMEOUT_SENTINEL or not is_auth:
            await client.disconnect()
            return {
                "success": False,
                "error": "Session is not authorized" if is_auth is not TIMEOUT_SENTINEL else "Operation timed out",
                "session_path": session_path
            }
        
        applied_settings = []
        errors = []
        
        # Apply each enabled setting sequentially
        for privacy_key_name, privacy_value_name in settings.items():
            try:
                # Get the privacy key class
                if privacy_key_name not in PRIVACY_KEY_MAP:
                    errors.append(f"Unknown privacy key: {privacy_key_name}")
                    continue
                
                privacy_key_class = PRIVACY_KEY_MAP[privacy_key_name]
                privacy_key = privacy_key_class()
                
                # Get the privacy value class
                if privacy_value_name not in PRIVACY_VALUE_MAP:
                    errors.append(f"Unknown privacy value: {privacy_value_name}")
                    continue
                
                privacy_value_class = PRIVACY_VALUE_MAP[privacy_value_name]
                privacy_value = privacy_value_class()
                
                # Apply the privacy setting
                await client(SetPrivacyRequest(
                    key=privacy_key,
                    rules=[privacy_value]
                ))
                
                applied_settings.append({
                    "key": privacy_key_name,
                    "value": privacy_value_name
                })
                
            except errors.FloodWaitError as e:
                # Wait and retry once
                await asyncio.sleep(e.seconds)
                try:
                    privacy_key_class = PRIVACY_KEY_MAP[privacy_key_name]
                    privacy_key = privacy_key_class()
                    privacy_value_class = PRIVACY_VALUE_MAP[privacy_value_name]
                    privacy_value = privacy_value_class()
                    await client(SetPrivacyRequest(
                        key=privacy_key,
                        rules=[privacy_value]
                    ))
                    applied_settings.append({
                        "key": privacy_key_name,
                        "value": privacy_value_name
                    })
                except Exception as retry_error:
                    errors.append(f"{privacy_key_name}: {str(retry_error)}")
                    
            except Exception as e:
                errors.append(f"{privacy_key_name}: {str(e)}")
        
        await client.disconnect()
        
        if errors and not applied_settings:
            return {
                "success": False,
                "error": "; ".join(errors),
                "session_path": session_path
            }
        elif errors:
            return {
                "success": True,
                "applied_settings": applied_settings,
                "errors": errors,
                "session_path": session_path
            }
        else:
            return {
                "success": True,
                "applied_settings": applied_settings,
                "session_path": session_path
            }
        
    except errors.FloodWaitError as e:
        try:
            await client.disconnect()
        except:
            pass
        return {
            "success": False,
            "error": f"Rate limited. Please wait {e.seconds} seconds",
            "session_path": session_path
        }
    except errors.UserDeactivatedError:
        try:
            await client.disconnect()
        except:
            pass
        return {
            "success": False,
            "error": "Account is deactivated",
            "session_path": session_path
        }
    except errors.UserDeactivatedBanError:
        try:
            await client.disconnect()
        except:
            pass
        return {
            "success": False,
            "error": "Account is banned",
            "session_path": session_path
        }
    except errors.RPCError as e:
        try:
            await client.disconnect()
        except:
            pass
        return {
            "success": False,
            "error": f"Telegram error: {str(e)}",
            "session_path": session_path
        }
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        return {
            "success": False,
            "error": f"Error: {str(e)}",
            "session_path": session_path
        }


async def apply_privacy_settings_parallel(
    sessions: List[Dict[str, Any]]
) -> Dict[int, Dict[str, Any]]:
    """
    Apply privacy settings to multiple sessions in parallel.
    
    Args:
        sessions: List of dicts, each containing:
            - path: session file path
            - settings: dict of privacy key names to privacy value names
    
    Returns:
        dict: Results indexed by session index
    """
    tasks = []
    for idx, session in enumerate(sessions):
        session_path = session.get("path")
        settings = session.get("settings", {})
        
        if not session_path:
            continue
        
        task = apply_privacy_settings_for_session(session_path, settings)
        tasks.append((idx, task))
    
    # Execute all tasks concurrently
    results = {}
    if tasks:
        task_results = await asyncio.gather(*[task for _, task in tasks], return_exceptions=True)
        
        for (idx, _), result in zip(tasks, task_results):
            if isinstance(result, Exception):
                session_path = sessions[idx].get("path", "unknown")
                results[idx] = {
                    "success": False,
                    "error": str(result),
                    "session_path": session_path
                }
            else:
                results[idx] = result
    
    return results

